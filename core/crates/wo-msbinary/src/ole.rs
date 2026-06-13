//! OLE Compound Document parser.
//!
//! Implements the Microsoft Compound Binary File Format Specification
//! (MS-CFB) for reading .doc, .xls, .ppt, and other OLE files.

use std::io::{Cursor, Read, Seek, SeekFrom};

use crate::model::*;

/// OLE magic signature: `D0 CF 11 E0 A1 B1 1A E1`.
const OLE_SIGNATURE: [u8; 8] = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

/// Each directory entry is exactly 128 bytes.
const DIR_ENTRY_SIZE: usize = 128;

/// Maximum name length in characters (UTF-16 code units) for a directory entry.
const MAX_ENTRY_NAME_CHARS: usize = 31;

/// Number of DIFAT entries embedded in the header (offset 76..).
const HEADER_DIFAT_COUNT: usize = 109;

/// Parsed OLE Compound Document.
#[derive(Debug)]
pub struct OleCompoundDoc<'a> {
    data: &'a [u8],
    header: OleHeader,
    fat: Vec<u32>,
    #[allow(dead_code)]
    difat: Vec<u32>,
    directory: Vec<OleDirectoryEntry>,
    mini_fat: Vec<u32>,
    mini_stream: Option<Vec<u8>>,
}

impl<'a> OleCompoundDoc<'a> {
    /// Parse an OLE compound document from raw bytes.
    pub fn parse(data: &'a [u8]) -> Result<Self, String> {
        if data.len() < 512 {
            return Err("File too small for OLE compound document".into());
        }

        // 1. Validate and parse header (first 512 bytes)
        let header = parse_header(data)?;

        let sector_size = 1usize << header.sector_size_power;

        // 2. Parse DIFAT
        let difat = parse_difat(data, &header, sector_size)?;

        // 3. Parse FAT sectors from DIFAT chain
        let fat = parse_fat(data, &difat, sector_size)?;

        // 4. Parse directory chain to get all directory entries
        let directory = parse_directory(data, &header, &fat, sector_size)?;

        // 5. Parse mini-FAT (if present)
        let mini_fat = parse_mini_fat(data, &header, &fat, sector_size)?;

        // 6. Extract mini-stream (Root Storage entry's stream data)
        let mini_stream = extract_mini_stream(data, &directory, &fat, sector_size);

        Ok(OleCompoundDoc {
            data,
            header,
            fat,
            difat,
            directory,
            mini_fat,
            mini_stream,
        })
    }

    /// Get the OLE header.
    pub fn header(&self) -> &OleHeader {
        &self.header
    }

    /// Get all directory entries as a flat list.
    pub fn entries(&self) -> &[OleDirectoryEntry] {
        &self.directory
    }

    /// Get sector size in bytes.
    pub fn sector_size(&self) -> usize {
        1 << self.header.sector_size_power
    }

    /// List all storage and stream names (non-empty entries).
    pub fn list_streams(&self) -> Vec<String> {
        self.directory
            .iter()
            .filter(|e| e.entry_type != OleEntryType::Empty)
            .map(|e| e.name.clone())
            .collect()
    }

    /// Read a named stream by name.
    ///
    /// Looks up the directory entry by exact name match and reads its data.
    /// For RootStorage entries, returns the mini-stream container data.
    pub fn read_stream_by_name(&self, name: &str) -> Result<Vec<u8>, String> {
        let entry = self
            .directory
            .iter()
            .find(|e| e.name == name && e.entry_type == OleEntryType::Stream)
            .ok_or_else(|| format!("Stream not found: {}", name))?;

        self.read_entry_stream(entry)
    }

    /// Get a directory entry by name.
    pub fn get_entry(&self, name: &str) -> Option<&OleDirectoryEntry> {
        self.directory
            .iter()
            .find(|e| e.name == name && e.entry_type != OleEntryType::Empty)
    }

    /// Read stream data from a directory entry.
    fn read_entry_stream(&self, entry: &OleDirectoryEntry) -> Result<Vec<u8>, String> {
        if entry.stream_size == 0 {
            return Ok(Vec::new());
        }

        // Streams smaller than mini_stream_cutoff are stored in the mini-stream
        // A cutoff of 0 means mini-stream is disabled
        let mini_cutoff = if self.header.mini_stream_cutoff == 0 {
            0 // mini-stream disabled
        } else {
            self.header.mini_stream_cutoff as u64
        };

        if mini_cutoff > 0 && entry.stream_size < mini_cutoff && self.mini_stream.is_some() {
            self.read_mini_stream(entry.starting_sector, entry.stream_size)
        } else {
            self.read_stream_from_chain(entry.starting_sector, entry.stream_size)
        }
    }

    /// Read a stream from the regular sector chain.
    fn read_stream_from_chain(&self, start_sector: u32, size: u64) -> Result<Vec<u8>, String> {
        let sector_size = self.sector_size();
        let mut result = Vec::with_capacity(size as usize);
        let mut sector = start_sector;
        let mut remaining = size;

        loop {
            if sector == ENDOFCHAIN || sector == FREESECT {
                break;
            }
            if sector as usize >= self.fat.len() {
                return Err(format!(
                    "FAT chain references sector {} but FAT has {} entries",
                    sector,
                    self.fat.len()
                ));
            }

            let offset = (sector as usize + 1) * sector_size;
            let to_read = (remaining as usize).min(sector_size);
            if offset + to_read > self.data.len() {
                return Err(format!(
                    "Sector {} at offset {} exceeds file size {}",
                    sector,
                    offset,
                    self.data.len()
                ));
            }

            result.extend_from_slice(&self.data[offset..offset + to_read]);
            remaining -= to_read as u64;

            let next = self.fat[sector as usize];
            sector = next;
        }

        // Truncate to exact requested size
        result.truncate(size as usize);
        Ok(result)
    }

    /// Read a stream from the mini-stream using the mini-FAT chain.
    fn read_mini_stream(&self, start_sector: u32, size: u64) -> Result<Vec<u8>, String> {
        let mini_stream = self
            .mini_stream
            .as_ref()
            .ok_or("Mini-stream not available")?;
        let mini_sector_size = 1usize << self.header.mini_sector_size_power;
        let mut result = Vec::with_capacity(size as usize);
        let mut sector = start_sector;
        let mut remaining = size;

        loop {
            if sector == ENDOFCHAIN || sector == FREESECT {
                break;
            }
            if sector as usize >= self.mini_fat.len() {
                // If mini-FAT is empty and we have a start sector, the stream
                // might be using a single unchained sector (common in minimal files).
                // Try to read from the mini-stream directly.
                let offset = sector as usize * mini_sector_size;
                let to_read = (remaining as usize).min(mini_sector_size);
                let end = (offset + to_read).min(mini_stream.len());
                if offset <= end {
                    result.extend_from_slice(&mini_stream[offset..end]);
                }
                break;
            }

            let offset = sector as usize * mini_sector_size;
            let to_read = (remaining as usize).min(mini_sector_size);
            let end = (offset + to_read).min(mini_stream.len());
            if offset > end {
                return Err(format!(
                    "Mini-stream sector {} at offset {} exceeds mini-stream size {}",
                    sector,
                    offset,
                    mini_stream.len()
                ));
            }

            result.extend_from_slice(&mini_stream[offset..end]);
            remaining -= (end - offset) as u64;

            let next = self.mini_fat[sector as usize];
            sector = next;
        }

        result.truncate(size as usize);
        Ok(result)
    }

    /// Get the root storage entry, if present.
    pub fn root_entry(&self) -> Option<&OleDirectoryEntry> {
        self.directory
            .iter()
            .find(|e| e.entry_type == OleEntryType::RootStorage)
    }

    /// Navigate directory tree: get children of a storage entry.
    pub fn children_of(&self, entry_id: usize) -> Vec<usize> {
        let entry = match self.directory.get(entry_id) {
            Some(e) => e,
            None => return Vec::new(),
        };
        if entry.child_id == NOSTREAM {
            return Vec::new();
        }
        let mut result = Vec::new();
        let mut stack = vec![entry.child_id as usize];
        let mut visited = std::collections::HashSet::new();
        while let Some(id) = stack.pop() {
            if !visited.insert(id) {
                continue;
            }
            if let Some(child) = self.directory.get(id) {
                if child.entry_type != OleEntryType::Empty {
                    result.push(id);
                }
                if child.left_sibling_id != NOSTREAM {
                    stack.push(child.left_sibling_id as usize);
                }
                if child.right_sibling_id != NOSTREAM {
                    stack.push(child.right_sibling_id as usize);
                }
            }
        }
        result.sort();
        result.dedup();
        result
    }
}

// ============================================================================
// Header parsing
// ============================================================================

fn parse_header(data: &[u8]) -> Result<OleHeader, String> {
    let mut cursor = Cursor::new(data);

    let mut magic = [0u8; 8];
    cursor
        .read_exact(&mut magic)
        .map_err(|_| "Failed to read magic bytes")?;

    if magic != OLE_SIGNATURE {
        return Err(format!(
            "Invalid OLE signature: expected {:02X?}, got {:02X?}",
            OLE_SIGNATURE, magic
        ));
    }

    // Seek past CLSID (16 bytes at offset 8..24) to version fields
    cursor
        .seek(SeekFrom::Start(24))
        .map_err(|_| "Failed to seek in header")?;

    let minor_version = read_u16(&mut cursor)?;
    let major_version = read_u16(&mut cursor)?;
    let byte_order = read_u16(&mut cursor)?;

    // Now at offset 30: sector_size_power, mini_sector_size_power
    let sector_size_power = read_u16(&mut cursor)?;
    let mini_sector_size_power = read_u16(&mut cursor)?;

    // Reserved (bytes 34-39, 6 bytes of zeros)
    cursor
        .seek(SeekFrom::Current(6))
        .map_err(|_| "Failed to seek past reserved bytes")?;

    let total_dir_sectors = read_u32(&mut cursor)?;
    let total_fat_sectors = read_u32(&mut cursor)?;
    let first_dir_sector_fat = read_u32(&mut cursor)?;
    let transaction_signature = read_u32(&mut cursor)?;

    // Compute mini_stream_cutoff; v3 = 0x00001000, v4 may differ
    let mini_stream_cutoff = if transaction_signature == 0 {
        // For v3 files, transaction_signature is reserved and the actual
        // mini_stream_cutoff is at the next position
        read_u32(&mut cursor)?
    } else {
        // The standard offset 56 is mini_stream_cutoff
        read_u32(&mut cursor)?
    };

    let first_mini_fat_sector = read_u32(&mut cursor)?;
    let total_mini_fat_sectors = read_u32(&mut cursor)?;
    let first_difat_sector = read_u32(&mut cursor)?;
    let total_difat_sectors = read_u32(&mut cursor)?;

    Ok(OleHeader {
        magic,
        minor_version,
        major_version,
        byte_order,
        sector_size_power,
        mini_sector_size_power,
        total_dir_sectors,
        total_fat_sectors,
        first_dir_sector_fat,
        mini_stream_cutoff,
        first_mini_fat_sector,
        total_mini_fat_sectors,
        first_difat_sector,
        total_difat_sectors,
    })
}

// ============================================================================
// DIFAT parsing
// ============================================================================

fn parse_difat(data: &[u8], header: &OleHeader, sector_size: usize) -> Result<Vec<u32>, String> {
    let mut difat = Vec::new();
    let max_fat_sectors = header.total_fat_sectors as usize;

    // First 109 DIFAT entries are in the header starting at offset 76
    for i in 0..HEADER_DIFAT_COUNT {
        if difat.len() >= max_fat_sectors {
            break;
        }
        let offset = 76 + i * 4;
        if offset + 4 > data.len() {
            break;
        }
        let sector_id = u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        if sector_id == FREESECT || sector_id > MAXREGSECT {
            break;
        }
        difat.push(sector_id);
    }

    // Follow additional DIFAT sectors if present
    if header.first_difat_sector != ENDOFCHAIN && header.first_difat_sector != FREESECT {
        let mut current_difat_sector = header.first_difat_sector;
        let mut visited = std::collections::HashSet::new();

        while current_difat_sector != ENDOFCHAIN
            && current_difat_sector != FREESECT
            && visited.insert(current_difat_sector)
        {
            let sectors_per_difat = (sector_size / 4) - 1; // last slot is chain pointer
            let offset = (current_difat_sector as usize + 1) * sector_size;

            for i in 0..sectors_per_difat {
                if difat.len() >= max_fat_sectors {
                    break;
                }
                let pos = offset + i * 4;
                if pos + 4 > data.len() {
                    break;
                }
                let sector_id =
                    u32::from_le_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]);
                if sector_id == FREESECT || sector_id > MAXREGSECT {
                    break;
                }
                difat.push(sector_id);
            }

            // Read the chain pointer (last u32 in the DIFAT sector)
            let chain_pos = offset + sectors_per_difat * 4;
            if chain_pos + 4 > data.len() {
                break;
            }
            current_difat_sector = u32::from_le_bytes([
                data[chain_pos],
                data[chain_pos + 1],
                data[chain_pos + 2],
                data[chain_pos + 3],
            ]);
        }
    }

    Ok(difat)
}

// ============================================================================
// FAT parsing
// ============================================================================

fn parse_fat(data: &[u8], difat: &[u32], sector_size: usize) -> Result<Vec<u32>, String> {
    if difat.is_empty() {
        return Err("DIFAT is empty, no FAT sectors to parse".into());
    }

    let entries_per_sector = sector_size / 4;
    let mut fat = Vec::with_capacity(difat.len() * entries_per_sector);

    for &difat_sector in difat {
        let offset = (difat_sector as usize + 1) * sector_size;
        for i in 0..entries_per_sector {
            let pos = offset + i * 4;
            if pos + 4 > data.len() {
                break;
            }
            let entry =
                u32::from_le_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]);
            fat.push(entry);
        }
    }

    Ok(fat)
}

// ============================================================================
// Directory parsing
// ============================================================================

fn parse_directory(
    data: &[u8],
    header: &OleHeader,
    fat: &[u32],
    sector_size: usize,
) -> Result<Vec<OleDirectoryEntry>, String> {
    if header.first_dir_sector_fat == ENDOFCHAIN || header.first_dir_sector_fat == FREESECT {
        return Err("No directory sector specified in header".into());
    }

    let entries_per_sector = sector_size / DIR_ENTRY_SIZE;
    let mut entries = Vec::new();
    let mut current_sector = header.first_dir_sector_fat;
    let mut visited = std::collections::HashSet::new();

    while current_sector != ENDOFCHAIN
        && current_sector != FREESECT
        && visited.insert(current_sector)
    {
        if current_sector as usize >= fat.len() {
            break;
        }

        let sector_offset = (current_sector as usize + 1) * sector_size;
        if sector_offset + sector_size > data.len() {
            break;
        }

        for i in 0..entries_per_sector {
            let entry_offset = sector_offset + i * DIR_ENTRY_SIZE;
            if entry_offset + DIR_ENTRY_SIZE > data.len() {
                break;
            }
            let entry_data = &data[entry_offset..entry_offset + DIR_ENTRY_SIZE];
            match parse_directory_entry(entry_data) {
                Ok(entry) => entries.push(entry),
                Err(_) => {
                    // Skip unparseable entries but continue parsing
                    entries.push(OleDirectoryEntry::empty());
                }
            }
        }

        current_sector = fat[current_sector as usize];
    }

    Ok(entries)
}

fn parse_directory_entry(data: &[u8]) -> Result<OleDirectoryEntry, String> {
    if data.len() < DIR_ENTRY_SIZE {
        return Err("Directory entry data too short".into());
    }

    // Parse entry name (UTF-16LE, up to 32 code units = 64 bytes, null-terminated)
    let name_length = u16::from_le_bytes([data[64], data[65]]) as usize;
    let name = if name_length > 2 {
        let char_count = ((name_length - 2) / 2).min(MAX_ENTRY_NAME_CHARS);
        let mut name_chars = String::with_capacity(char_count);
        for i in 0..char_count {
            let offset = i * 2;
            if offset + 2 <= name_length && offset + 2 <= data.len() {
                let code_unit = u16::from_le_bytes([data[offset], data[offset + 1]]);
                if code_unit == 0 {
                    break;
                }
                if let Some(ch) = char::from_u32(code_unit as u32) {
                    name_chars.push(ch);
                }
            }
        }
        name_chars
    } else {
        String::new()
    };

    // Object type (byte 66)
    let entry_type = match data[66] {
        0 => OleEntryType::Empty,
        1 => OleEntryType::Storage,
        2 => OleEntryType::Stream,
        5 => OleEntryType::RootStorage,
        other => return Err(format!("Unknown directory entry type: {}", other)),
    };

    // Color flag (byte 67)
    let color = match data[67] {
        0 => OleColor::Red,
        1 => OleColor::Black,
        _ => OleColor::Red,
    };

    // Sibling and child IDs
    let left_sibling_id = u32::from_le_bytes([data[68], data[69], data[70], data[71]]);
    let right_sibling_id = u32::from_le_bytes([data[72], data[73], data[74], data[75]]);
    let child_id = u32::from_le_bytes([data[76], data[77], data[78], data[79]]);

    // CLSID (bytes 80-95)
    let mut clsid = [0u8; 16];
    clsid.copy_from_slice(&data[80..96]);

    // State bits (bytes 96-99)
    let state_bits = u32::from_le_bytes([data[96], data[97], data[98], data[99]]);

    // Creation time (bytes 100-107)
    let creation_time = u64::from_le_bytes([
        data[100], data[101], data[102], data[103], data[104], data[105], data[106], data[107],
    ]);

    // Modification time (bytes 108-115)
    let modification_time = u64::from_le_bytes([
        data[108], data[109], data[110], data[111], data[112], data[113], data[114], data[115],
    ]);

    // Starting sector (bytes 116-119)
    let starting_sector = u32::from_le_bytes([data[116], data[117], data[118], data[119]]);

    // Stream size (bytes 120-127)
    let stream_size = u64::from_le_bytes([
        data[120], data[121], data[122], data[123], data[124], data[125], data[126], data[127],
    ]);

    Ok(OleDirectoryEntry {
        name,
        entry_type,
        color,
        left_sibling_id,
        right_sibling_id,
        child_id,
        clsid,
        state_bits,
        creation_time,
        modification_time,
        starting_sector,
        stream_size,
    })
}

// ============================================================================
// Mini-FAT parsing
// ============================================================================

fn parse_mini_fat(
    data: &[u8],
    header: &OleHeader,
    fat: &[u32],
    sector_size: usize,
) -> Result<Vec<u32>, String> {
    if header.first_mini_fat_sector == ENDOFCHAIN || header.first_mini_fat_sector == FREESECT {
        return Ok(Vec::new());
    }

    let entries_per_sector = sector_size / 4;
    let mut mini_fat = Vec::new();
    let mut current_sector = header.first_mini_fat_sector;
    let mut visited = std::collections::HashSet::new();

    while current_sector != ENDOFCHAIN
        && current_sector != FREESECT
        && visited.insert(current_sector)
    {
        if current_sector as usize >= fat.len() {
            break;
        }

        let sector_offset = (current_sector as usize + 1) * sector_size;
        if sector_offset + sector_size > data.len() {
            break;
        }

        for i in 0..entries_per_sector {
            let pos = sector_offset + i * 4;
            let entry =
                u32::from_le_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]);
            mini_fat.push(entry);
        }

        current_sector = fat[current_sector as usize];
    }

    Ok(mini_fat)
}

// ============================================================================
// Mini-stream extraction
// ============================================================================

fn extract_mini_stream(
    data: &[u8],
    directory: &[OleDirectoryEntry],
    fat: &[u32],
    sector_size: usize,
) -> Option<Vec<u8>> {
    let root = directory
        .iter()
        .find(|e| e.entry_type == OleEntryType::RootStorage)?;
    if root.stream_size == 0 {
        return Some(Vec::new());
    }
    if root.starting_sector == ENDOFCHAIN || root.starting_sector == FREESECT {
        return Some(Vec::new());
    }

    let mut result = Vec::with_capacity(root.stream_size as usize);
    let mut sector = root.starting_sector;
    let mut remaining = root.stream_size;

    loop {
        if sector == ENDOFCHAIN || sector == FREESECT {
            break;
        }
        if sector as usize >= fat.len() {
            break;
        }

        let offset = (sector as usize + 1) * sector_size;
        let to_read = (remaining as usize).min(sector_size);
        let end_pos = offset.checked_add(to_read)?;
        if end_pos > data.len() {
            break;
        }

        result.extend_from_slice(&data[offset..end_pos]);
        remaining -= to_read as u64;
        sector = fat[sector as usize];
    }

    result.truncate(root.stream_size as usize);
    Some(result)
}

// ============================================================================
// Helper I/O functions
// ============================================================================

fn read_u16(cursor: &mut Cursor<&[u8]>) -> Result<u16, String> {
    let mut buf = [0u8; 2];
    cursor
        .read_exact(&mut buf)
        .map_err(|e| format!("Failed to read u16: {}", e))?;
    Ok(u16::from_le_bytes(buf))
}

fn read_u32(cursor: &mut Cursor<&[u8]>) -> Result<u32, String> {
    let mut buf = [0u8; 4];
    cursor
        .read_exact(&mut buf)
        .map_err(|e| format!("Failed to read u32: {}", e))?;
    Ok(u32::from_le_bytes(buf))
}

// ============================================================================
// Helper on OleDirectoryEntry
// ============================================================================

impl OleDirectoryEntry {
    /// Create an empty directory entry (placeholder for unparseable entries).
    fn empty() -> Self {
        OleDirectoryEntry {
            name: String::new(),
            entry_type: OleEntryType::Empty,
            color: OleColor::Red,
            left_sibling_id: NOSTREAM,
            right_sibling_id: NOSTREAM,
            child_id: NOSTREAM,
            clsid: [0u8; 16],
            state_bits: 0,
            creation_time: 0,
            modification_time: 0,
            starting_sector: 0,
            stream_size: 0,
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a minimal valid OLE compound document with:
    /// - 512-byte header
    /// - One FAT sector (sector 0) containing: [ENDOFCHAIN, FREESECT, ...]
    /// - One directory sector (sector 1) containing Root Entry + one stream
    /// - One data sector (sector 2) for the stream content
    fn build_minimal_ole(stream_data: &[u8], stream_name: &str) -> Vec<u8> {
        let sector_size: usize = 512;
        let header_size: usize = 512;
        // Sectors: 0 = FAT, 1 = Directory, 2 = stream data
        let total_size = header_size + 3 * sector_size;

        let mut buf = vec![0u8; total_size];

        // --- Header (offset 0..512) ---
        // Magic
        buf[0..8].copy_from_slice(&OLE_SIGNATURE);
        // Minor version (0x003E)
        buf[24] = 0x3E;
        buf[25] = 0x00;
        // Major version (0x0003 = v3)
        buf[26] = 0x03;
        buf[27] = 0x00;
        // Byte order (0xFFFE = little-endian)
        buf[28] = 0xFE;
        buf[29] = 0xFF;
        // Sector size power (9 = 512 bytes)
        buf[30] = 0x09;
        buf[31] = 0x00;
        // Mini sector size power (6 = 64 bytes)
        buf[32] = 0x06;
        buf[33] = 0x00;

        // Reserved 6 bytes at 34..40 (zeros)

        // Total directory sectors (v3 = 0)
        // already zero

        // Total FAT sectors = 1
        buf[44] = 0x01; // LE

        // First directory sector FAT = 1 (sector index 1)
        buf[48] = 0x01;

        // Mini stream cutoff = 4096 (0x00001000)
        buf[56] = 0x00;
        buf[57] = 0x10;

        // First mini FAT sector = ENDOFCHAIN (no mini-FAT)
        buf[60] = 0xFE;
        buf[61] = 0xFF;
        buf[62] = 0xFF;
        buf[63] = 0xFF;

        // Total mini FAT sectors = 0
        // already zero

        // First DIFAT sector = ENDOFCHAIN (no extra DIFAT)
        buf[68] = 0xFE;
        buf[69] = 0xFF;
        buf[70] = 0xFF;
        buf[71] = 0xFF;

        // Total DIFAT sectors = 0
        // already zero

        // DIFAT[0] = sector 0 (the FAT sector)
        buf[76] = 0x00;
        buf[77] = 0x00;
        buf[78] = 0x00;
        buf[79] = 0x00;

        // --- FAT sector (sector 0, offset 512) ---
        let fat_offset = header_size;
        // Sector 0 (FAT itself): ENDOFCHAIN
        buf[fat_offset] = 0xFE;
        buf[fat_offset + 1] = 0xFF;
        buf[fat_offset + 2] = 0xFF;
        buf[fat_offset + 3] = 0xFF;
        // Sector 1 (Directory): ENDOFCHAIN
        buf[fat_offset + 4] = 0xFE;
        buf[fat_offset + 5] = 0xFF;
        buf[fat_offset + 6] = 0xFF;
        buf[fat_offset + 7] = 0xFF;
        // Sector 2 (Stream data): ENDOFCHAIN
        buf[fat_offset + 8] = 0xFE;
        buf[fat_offset + 9] = 0xFF;
        buf[fat_offset + 10] = 0xFF;
        buf[fat_offset + 11] = 0xFF;

        // --- Directory sector (sector 1, offset 1024) ---
        let dir_offset = header_size + sector_size;

        // Entry 0: Root Storage
        let root_name = encode_utf16le("Root Entry");
        buf[dir_offset..dir_offset + root_name.len()].copy_from_slice(&root_name);
        // Name length (including null terminator)
        let name_len_bytes = (root_name.len() + 2) as u16; // +2 for null
        buf[dir_offset + 64..dir_offset + 66].copy_from_slice(&name_len_bytes.to_le_bytes());
        // Object type: 5 = RootStorage
        buf[dir_offset + 66] = 0x05;
        // Color: 1 = Black
        buf[dir_offset + 67] = 0x01;
        // Child ID = 1 (the stream entry)
        buf[dir_offset + 76] = 0x01;
        // Starting sector for Root Storage's mini-stream data = ENDOFCHAIN (none)
        buf[dir_offset + 116] = 0xFE;
        buf[dir_offset + 117] = 0xFF;
        buf[dir_offset + 118] = 0xFF;
        buf[dir_offset + 119] = 0xFF;

        // Entry 1: Stream
        let stream_entry_offset = dir_offset + DIR_ENTRY_SIZE;
        let stream_name_encoded = encode_utf16le(stream_name);
        buf[stream_entry_offset..stream_entry_offset + stream_name_encoded.len()]
            .copy_from_slice(&stream_name_encoded);
        // Name length
        let sname_len = (stream_name_encoded.len() + 2) as u16;
        buf[stream_entry_offset + 64..stream_entry_offset + 66]
            .copy_from_slice(&sname_len.to_le_bytes());
        // Object type: 2 = Stream
        buf[stream_entry_offset + 66] = 0x02;
        // Color: 1 = Black
        buf[stream_entry_offset + 67] = 0x01;
        // Starting sector = 2
        buf[stream_entry_offset + 116] = 0x02;
        // Stream size
        buf[stream_entry_offset + 120..stream_entry_offset + 128]
            .copy_from_slice(&(stream_data.len() as u64).to_le_bytes());

        // --- Stream data sector (sector 2, offset 1536) ---
        let data_offset = header_size + 2 * sector_size;
        let copy_len = stream_data.len().min(sector_size);
        buf[data_offset..data_offset + copy_len].copy_from_slice(&stream_data[..copy_len]);

        buf
    }

    /// Encode a string as UTF-16LE bytes (without null terminator).
    fn encode_utf16le(s: &str) -> Vec<u8> {
        let mut buf = Vec::with_capacity(s.len() * 2);
        for ch in s.chars() {
            let code = ch as u16;
            buf.push((code & 0xFF) as u8);
            buf.push((code >> 8) as u8);
        }
        buf
    }

    /// Build an OLE file with a mini-stream containing a small stream.
    /// Layout:
    /// - Sector 0: FAT (chain: 0→END, 1→END, 2→END, 3→END)
    /// - Sector 1: Directory (Root Entry + stream entry)
    /// - Sector 2: Root Entry's mini-stream container (contains the actual mini-stream data)
    fn build_ole_with_mini_stream(stream_data: &[u8], stream_name: &str) -> Vec<u8> {
        let sector_size: usize = 512;
        let header_size: usize = 512;
        // Sectors: 0=FAT, 1=Directory, 2=mini-stream container
        let total_size = header_size + 3 * sector_size;

        let mut buf = vec![0u8; total_size];

        // --- Header ---
        buf[0..8].copy_from_slice(&OLE_SIGNATURE);
        buf[24] = 0x3E; // minor version
        buf[26] = 0x03; // major version v3
        buf[28] = 0xFE;
        buf[29] = 0xFF; // byte order
        buf[30] = 0x09;
        buf[31] = 0x00; // sector size power
        buf[32] = 0x06;
        buf[33] = 0x00; // mini sector size power
        buf[44] = 0x01; // total fat sectors
        buf[48] = 0x01; // first dir sector
        buf[56] = 0x00;
        buf[57] = 0x10; // mini_stream_cutoff = 4096
                        // first_mini_fat = ENDOFCHAIN
        buf[60..64].copy_from_slice(&ENDOFCHAIN.to_le_bytes());
        // first_difat = ENDOFCHAIN
        buf[68..72].copy_from_slice(&ENDOFCHAIN.to_le_bytes());
        // DIFAT[0] = 0
        buf[76..80].copy_from_slice(&0u32.to_le_bytes());

        // --- FAT (sector 0) ---
        let fat_off = header_size;
        // Sector 0→END, 1→END, 2→END
        for i in 0..3 {
            buf[fat_off + i * 4..fat_off + i * 4 + 4].copy_from_slice(&ENDOFCHAIN.to_le_bytes());
        }

        // --- Directory (sector 1) ---
        let dir_off = header_size + sector_size;

        // Entry 0: Root Storage
        let root_name_enc = encode_utf16le("Root Entry");
        buf[dir_off..dir_off + root_name_enc.len()].copy_from_slice(&root_name_enc);
        let rname_len = (root_name_enc.len() + 2) as u16;
        buf[dir_off + 64..dir_off + 66].copy_from_slice(&rname_len.to_le_bytes());
        buf[dir_off + 66] = 0x05; // RootStorage
        buf[dir_off + 67] = 0x01; // Black
        buf[dir_off + 68..dir_off + 72].copy_from_slice(&NOSTREAM.to_le_bytes()); // left sibling
        buf[dir_off + 72..dir_off + 76].copy_from_slice(&NOSTREAM.to_le_bytes()); // right sibling
        buf[dir_off + 76] = 0x01; // child = entry 1
                                  // Starting sector = 2 (mini-stream container)
        buf[dir_off + 116..dir_off + 120].copy_from_slice(&2u32.to_le_bytes());
        // Stream size = size of the mini-stream container
        buf[dir_off + 120..dir_off + 128]
            .copy_from_slice(&(stream_data.len() as u64).to_le_bytes());

        // Entry 1: Stream (stored in mini-stream)
        let s_off = dir_off + DIR_ENTRY_SIZE;
        let sname_enc = encode_utf16le(stream_name);
        buf[s_off..s_off + sname_enc.len()].copy_from_slice(&sname_enc);
        let sname_len = (sname_enc.len() + 2) as u16;
        buf[s_off + 64..s_off + 66].copy_from_slice(&sname_len.to_le_bytes());
        buf[s_off + 66] = 0x02; // Stream
        buf[s_off + 67] = 0x01; // Black
        buf[s_off + 68..s_off + 72].copy_from_slice(&NOSTREAM.to_le_bytes()); // left sibling
        buf[s_off + 72..s_off + 76].copy_from_slice(&NOSTREAM.to_le_bytes()); // right sibling
                                                                              // Starting mini-sector = 0 (within the mini-stream container at sector 2)
        buf[s_off + 116..s_off + 120].copy_from_slice(&0u32.to_le_bytes());
        buf[s_off + 120..s_off + 128].copy_from_slice(&(stream_data.len() as u64).to_le_bytes());

        // --- Mini-stream container (sector 2) ---
        let ms_off = header_size + 2 * sector_size;
        let copy_len = stream_data.len().min(sector_size);
        buf[ms_off..ms_off + copy_len].copy_from_slice(&stream_data[..copy_len]);

        buf
    }

    /// Build an OLE with a FAT chain spanning two sectors.
    fn build_ole_with_fat_chain() -> Vec<u8> {
        let sector_size: usize = 512;
        let header_size: usize = 512;
        // Sector 0: FAT, Sector 1: FAT2, Sector 2: Directory, Sector 3-4: data
        let total_size = header_size + 5 * sector_size;
        let mut buf = vec![0u8; total_size];

        // Header
        buf[0..8].copy_from_slice(&OLE_SIGNATURE);
        buf[24] = 0x3E;
        buf[26] = 0x03;
        buf[28] = 0xFE;
        buf[29] = 0xFF;
        buf[30] = 0x09;
        buf[31] = 0x00;
        buf[32] = 0x06;
        buf[33] = 0x00;
        buf[44] = 0x02; // 2 FAT sectors
        buf[48] = 0x02; // first dir sector = 2
                        // mini_stream_cutoff = 0 (disable mini-stream, use regular FAT for all)
        buf[56] = 0x00;
        buf[57] = 0x00;
        buf[60..64].copy_from_slice(&ENDOFCHAIN.to_le_bytes());
        buf[68..72].copy_from_slice(&ENDOFCHAIN.to_le_bytes());
        // DIFAT[0]=0, DIFAT[1]=1
        buf[76] = 0x00;
        buf[80] = 0x01;

        // FAT0 (sector 0): covers sectors 0-127
        let f0 = header_size;
        buf[f0..f0 + 4].copy_from_slice(&1u32.to_le_bytes()); // sector 0 → 1
                                                              // sector 1 is second FAT — we don't really need it properly chained
                                                              // sector 2 (dir) → ENDOFCHAIN
        buf[f0 + 8..f0 + 12].copy_from_slice(&ENDOFCHAIN.to_le_bytes());
        // sector 3 → 4 (data chain)
        buf[f0 + 12..f0 + 16].copy_from_slice(&4u32.to_le_bytes());
        // sector 4 → ENDOFCHAIN
        buf[f0 + 16..f0 + 20].copy_from_slice(&ENDOFCHAIN.to_le_bytes());

        // FAT1 (sector 1): just fill with FREESECT
        let f1 = header_size + sector_size;
        for i in 0..128 {
            buf[f1 + i * 4..f1 + i * 4 + 4].copy_from_slice(&FREESECT.to_le_bytes());
        }

        // Directory (sector 2)
        let dir_off = header_size + 2 * sector_size;
        // Root Entry
        let root_name = encode_utf16le("Root Entry");
        buf[dir_off..dir_off + root_name.len()].copy_from_slice(&root_name);
        let rnl = (root_name.len() + 2) as u16;
        buf[dir_off + 64..dir_off + 66].copy_from_slice(&rnl.to_le_bytes());
        buf[dir_off + 66] = 0x05; // RootStorage
        buf[dir_off + 67] = 0x01;
        buf[dir_off + 68..dir_off + 72].copy_from_slice(&NOSTREAM.to_le_bytes()); // left sibling
        buf[dir_off + 72..dir_off + 76].copy_from_slice(&NOSTREAM.to_le_bytes()); // right sibling
        buf[dir_off + 76] = 0x01; // child
        buf[dir_off + 116..dir_off + 120].copy_from_slice(&ENDOFCHAIN.to_le_bytes());
        buf[dir_off + 120..dir_off + 128].copy_from_slice(&0u64.to_le_bytes());

        // Stream entry (sector chain 3→4)
        let s_off = dir_off + DIR_ENTRY_SIZE;
        let sname = encode_utf16le("BigStream");
        buf[s_off..s_off + sname.len()].copy_from_slice(&sname);
        let snl = (sname.len() + 2) as u16;
        buf[s_off + 64..s_off + 66].copy_from_slice(&snl.to_le_bytes());
        buf[s_off + 66] = 0x02; // Stream
        buf[s_off + 67] = 0x01;
        buf[s_off + 68..s_off + 72].copy_from_slice(&NOSTREAM.to_le_bytes()); // left sibling
        buf[s_off + 72..s_off + 76].copy_from_slice(&NOSTREAM.to_le_bytes()); // right sibling
        buf[s_off + 116..s_off + 120].copy_from_slice(&3u32.to_le_bytes()); // starts at sector 3
        buf[s_off + 120..s_off + 128].copy_from_slice(&1024u64.to_le_bytes()); // 2 sectors = 1024 bytes

        // Data sectors 3 and 4
        let d3 = header_size + 3 * sector_size;
        let d4 = header_size + 4 * sector_size;
        for i in 0..512 {
            buf[d3 + i] = b'A';
            buf[d4 + i] = b'B';
        }

        buf
    }

    #[test]
    fn test_parse_minimal_valid_ole() {
        let data = build_minimal_ole(b"Hello OLE!", "TestStream");
        let doc = OleCompoundDoc::parse(&data).expect("Should parse minimal OLE");

        assert_eq!(doc.sector_size(), 512);
        assert_eq!(doc.header().magic, OLE_SIGNATURE);
        assert_eq!(doc.header().sector_size_power, 9);
        assert_eq!(doc.header().major_version, 3);
    }

    #[test]
    fn test_reject_too_small() {
        let result = OleCompoundDoc::parse(&[0xD0; 100]);
        assert!(result.is_err());
    }

    #[test]
    fn test_reject_wrong_magic() {
        let mut buf = vec![0u8; 512];
        // Wrong magic
        buf[0..8].copy_from_slice(b"NOT_OLE!");
        let result = OleCompoundDoc::parse(&buf);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid OLE signature"));
    }

    #[test]
    fn test_directory_entries_count() {
        let data = build_minimal_ole(b"test", "MyStream");
        let doc = OleCompoundDoc::parse(&data).unwrap();

        // Should have Root Entry + MyStream
        let non_empty: Vec<_> = doc
            .entries()
            .iter()
            .filter(|e| e.entry_type != OleEntryType::Empty)
            .collect();
        assert_eq!(non_empty.len(), 2);
    }

    #[test]
    fn test_root_entry_is_root_storage() {
        let data = build_minimal_ole(b"test", "S");
        let doc = OleCompoundDoc::parse(&data).unwrap();

        let root = doc.root_entry().expect("Should have root entry");
        assert_eq!(root.entry_type, OleEntryType::RootStorage);
        assert_eq!(root.name, "Root Entry");
    }

    #[test]
    fn test_list_streams() {
        let data = build_minimal_ole(b"data", "WordDocument");
        let doc = OleCompoundDoc::parse(&data).unwrap();

        let streams = doc.list_streams();
        assert!(streams.contains(&"Root Entry".to_string()));
        assert!(streams.contains(&"WordDocument".to_string()));
    }

    #[test]
    fn test_read_stream_by_name() {
        let content = b"Hello from OLE stream!";
        let data = build_ole_with_mini_stream(content, "MyContent");
        let doc = OleCompoundDoc::parse(&data).expect("Should parse");

        let stream = doc
            .read_stream_by_name("MyContent")
            .expect("Should find stream");
        assert_eq!(stream.as_slice(), content);
    }

    #[test]
    fn test_read_stream_not_found() {
        let data = build_minimal_ole(b"x", "Existing");
        let doc = OleCompoundDoc::parse(&data).unwrap();

        let result = doc.read_stream_by_name("NonExistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_fat_chain_following() {
        let data = build_ole_with_fat_chain();
        let doc = OleCompoundDoc::parse(&data).expect("Should parse multi-sector OLE");

        let stream = doc
            .read_stream_by_name("BigStream")
            .expect("Should find stream");
        // Should be 1024 bytes: 512 A's followed by 512 B's
        assert_eq!(stream.len(), 1024);
        assert!(stream[..512].iter().all(|&b| b == b'A'));
        assert!(stream[512..].iter().all(|&b| b == b'B'));
    }

    #[test]
    fn test_directory_tree_navigation() {
        let data = build_minimal_ole(b"x", "Child");
        let doc = OleCompoundDoc::parse(&data).unwrap();

        let root = doc.root_entry().unwrap();
        let _root_id = root as *const _ as usize;
        // Find root index
        let root_idx = doc
            .entries()
            .iter()
            .position(|e| e.entry_type == OleEntryType::RootStorage)
            .unwrap();

        let children = doc.children_of(root_idx);
        assert!(!children.is_empty());
    }

    #[test]
    fn test_difat_chain_single() {
        let data = build_minimal_ole(b"x", "S");
        let doc = OleCompoundDoc::parse(&data).unwrap();

        // Should have 1 DIFAT entry (the single FAT sector)
        assert_eq!(doc.difat.len(), 1);
        assert_eq!(doc.difat[0], 0);
    }

    #[test]
    fn test_difat_chain_extended() {
        let data = build_ole_with_fat_chain();
        let doc = OleCompoundDoc::parse(&data).unwrap();

        // Should have 2 DIFAT entries (two FAT sectors)
        assert_eq!(doc.difat.len(), 2);
        assert_eq!(doc.difat[0], 0);
        assert_eq!(doc.difat[1], 1);
    }

    #[test]
    fn test_mini_stream_reading() {
        let content = b"tiny";
        let data = build_ole_with_mini_stream(content, "SmallStream");
        let doc = OleCompoundDoc::parse(&data).expect("Should parse");

        // The small stream should be read from the mini-stream
        let stream = doc.read_stream_by_name("SmallStream").expect("Should find");
        assert_eq!(stream.as_slice(), content);
    }

    #[test]
    fn test_header_difat_entries_count() {
        // Verify we read exactly 109 DIFAT entries from header
        let data = build_minimal_ole(b"x", "S");
        let doc = OleCompoundDoc::parse(&data).unwrap();
        // Only 1 valid entry; the rest are FREESECT and get skipped
        assert_eq!(doc.difat.len(), 1);
    }

    #[test]
    fn test_get_entry() {
        let data = build_minimal_ole(b"x", "MyStream");
        let doc = OleCompoundDoc::parse(&data).unwrap();

        let entry = doc.get_entry("MyStream").expect("Should find entry");
        assert_eq!(entry.entry_type, OleEntryType::Stream);
        assert!(
            entry.starting_sector <= 2,
            "starting_sector should be valid"
        );

        assert!(doc.get_entry("NoSuchStream").is_none());
    }

    #[test]
    fn test_empty_stream_size() {
        // Build OLE with an empty stream
        let mut data = build_minimal_ole(b"", "Empty");
        // Set stream size to 0 for entry 1
        let dir_off = 512 + 512;
        let stream_off = dir_off + DIR_ENTRY_SIZE;
        data[stream_off + 120..stream_off + 128].copy_from_slice(&0u64.to_le_bytes());

        let doc = OleCompoundDoc::parse(&data).unwrap();
        let stream = doc.read_stream_by_name("Empty").unwrap();
        assert!(stream.is_empty());
    }

    #[test]
    fn test_special_sector_constants() {
        assert_eq!(ENDOFCHAIN, 0xFFFFFFFE);
        assert_eq!(FREESECT, 0xFFFFFFFF);
        assert_eq!(NOSTREAM, 0xFFFFFFFF);
        assert_eq!(MAXREGSECT, 0xFFFFFFFA);
    }

    #[test]
    fn test_header_byte_order() {
        let data = build_minimal_ole(b"x", "S");
        let doc = OleCompoundDoc::parse(&data).unwrap();
        assert_eq!(doc.header().byte_order, 0xFFFE);
    }

    #[test]
    fn test_mini_sector_size_power() {
        let data = build_minimal_ole(b"x", "S");
        let doc = OleCompoundDoc::parse(&data).unwrap();
        assert_eq!(doc.header().mini_sector_size_power, 6); // 64-byte mini sectors
    }

    #[test]
    fn test_directory_entry_parse_internals() {
        // Test internal directory entry parsing directly
        let mut entry_data = vec![0u8; DIR_ENTRY_SIZE];
        let name = encode_utf16le("TestEntry");
        entry_data[..name.len()].copy_from_slice(&name);
        let name_len = (name.len() + 2) as u16; // +2 for null
        entry_data[64..66].copy_from_slice(&name_len.to_le_bytes());
        entry_data[66] = 0x02; // Stream
        entry_data[67] = 0x01; // Black
                               // Left sibling, right sibling = NOSTREAM
        entry_data[68..72].copy_from_slice(&NOSTREAM.to_le_bytes());
        entry_data[72..76].copy_from_slice(&NOSTREAM.to_le_bytes());
        // Child = NOSTREAM
        entry_data[76..80].copy_from_slice(&NOSTREAM.to_le_bytes());
        // Starting sector = 5
        entry_data[116..120].copy_from_slice(&5u32.to_le_bytes());
        // Stream size = 42
        entry_data[120..128].copy_from_slice(&42u64.to_le_bytes());

        let entry = parse_directory_entry(&entry_data).unwrap();
        assert_eq!(entry.name, "TestEntry");
        assert_eq!(entry.entry_type, OleEntryType::Stream);
        assert_eq!(entry.color, OleColor::Black);
        assert_eq!(entry.starting_sector, 5);
        assert_eq!(entry.stream_size, 42);
    }

    #[test]
    fn test_property_set_stream_extraction() {
        // Build OLE with a \005SummaryInformation stream name
        let data = build_ole_with_mini_stream(
            b"\x00\x00\x00\x00summary prop set data",
            "\x05SummaryInformation",
        );
        let doc = OleCompoundDoc::parse(&data).unwrap();

        // Verify the stream is listed and readable
        let streams = doc.list_streams();
        assert!(streams.iter().any(|s| s.contains("SummaryInformation")));

        let stream = doc.read_stream_by_name("\x05SummaryInformation").unwrap();
        assert!(!stream.is_empty());
    }
}
