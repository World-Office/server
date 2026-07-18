//! CRDT performance benchmarks for the coauthoring-service.
//!
//! Measures throughput and latency of diamond-types ListCRDT operations:
//!   - Insert (100, 1,000, 10,000 ops)
//!   - Delete (varying batch sizes)
//!   - Merge/sync between two documents
//!   - Serialize / deserialize roundtrip
//!
//! Run with:
//!   cargo bench -p coauthoring-service
//!   cargo bench -p coauthoring-service -- CRDT

use criterion::{BatchSize, Criterion, black_box, criterion_group, criterion_main};
use diamond_types::list::{ListCRDT, encoding::EncodeOptions};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Minimal Document wrapper — mirrors the production structure in main.rs but
// kept self-contained so we don't need to extract a library crate.
// ---------------------------------------------------------------------------

struct Doc {
    crdt: ListCRDT,
    agent_map: HashMap<String, u32>,
}

impl Doc {
    fn new() -> Self {
        Self {
            crdt: ListCRDT::new(),
            agent_map: HashMap::new(),
        }
    }

    fn agent_id(&mut self, user: &str) -> u32 {
        if let Some(&id) = self.agent_map.get(user) {
            return id;
        }
        let id = self.crdt.get_or_create_agent_id(user);
        self.agent_map.insert(user.to_string(), id);
        id
    }

    fn insert(&mut self, user: &str, pos: usize, text: &str) {
        let agent = self.agent_id(user);
        self.crdt.insert(agent, pos, text);
    }

    fn delete(&mut self, user: &str, start: usize, end: usize) {
        let agent = self.agent_id(user);
        self.crdt.delete(agent, start..end);
    }

    fn text(&self) -> String {
        self.crdt.branch.content().to_string()
    }

    /// Merge another document's ops into this one (replication).
    fn merge_from(&mut self, other: &Doc) {
        let encoded = other.crdt.oplog.encode(EncodeOptions::default());
        self.crdt.oplog.decode_and_add(&encoded).unwrap();
        let version = self.crdt.oplog.local_version_ref().to_vec();
        self.crdt.branch.merge(&self.crdt.oplog, &version);
    }

    /// Encode the full oplog to bytes.
    fn encode(&self) -> Vec<u8> {
        self.crdt.oplog.encode(EncodeOptions::default())
    }

    /// Decode bytes and add them to this document's oplog.
    fn decode_and_add(&mut self, bytes: &[u8]) {
        self.crdt.oplog.decode_and_add(bytes).unwrap();
    }
}

// ---------------------------------------------------------------------------
// Helper: build content strings of known length
// ---------------------------------------------------------------------------

fn content_of_len(n: usize) -> String {
    "a".repeat(n)
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

fn bench_crdt_insert_100(c: &mut Criterion) {
    c.bench_function("CRDT/insert/100", |b| {
        b.iter_batched(
            || {
                let mut doc = Doc::new();
                // pre-insert a small base to avoid edge-case splitting
                doc.insert("alice", 0, &content_of_len(10));
                (doc, content_of_len(100))
            },
            |(mut doc, text)| {
                doc.insert(black_box("alice"), black_box(0), black_box(&text));
            },
            BatchSize::SmallInput,
        )
    });
}

fn bench_crdt_insert_1000(c: &mut Criterion) {
    c.bench_function("CRDT/insert/1000", |b| {
        b.iter_batched(
            || {
                let mut doc = Doc::new();
                doc.insert("alice", 0, &content_of_len(10));
                (doc, content_of_len(1000))
            },
            |(mut doc, text)| {
                doc.insert(black_box("alice"), black_box(0), black_box(&text));
            },
            BatchSize::SmallInput,
        )
    });
}

fn bench_crdt_insert_10000(c: &mut Criterion) {
    c.bench_function("CRDT/insert/10000", |b| {
        b.iter_batched(
            || {
                let mut doc = Doc::new();
                doc.insert("alice", 0, &content_of_len(10));
                (doc, content_of_len(10_000))
            },
            |(mut doc, text)| {
                doc.insert(black_box("alice"), black_box(0), black_box(&text));
            },
            BatchSize::SmallInput,
        )
    });
}

fn bench_crdt_delete_small(c: &mut Criterion) {
    c.bench_function("CRDT/delete/small-batch-10", |b| {
        b.iter_batched(
            || {
                let mut doc = Doc::new();
                doc.insert("alice", 0, &content_of_len(500));
                doc
            },
            |mut doc| {
                for i in (0..100).rev() {
                    doc.delete(black_box("alice"), black_box(i * 5), black_box(i * 5 + 5));
                }
                black_box(doc.text());
            },
            BatchSize::SmallInput,
        )
    });
}

fn bench_crdt_delete_large(c: &mut Criterion) {
    c.bench_function("CRDT/delete/large-batch-500", |b| {
        b.iter_batched(
            || {
                let mut doc = Doc::new();
                doc.insert("alice", 0, &content_of_len(5000));
                doc
            },
            |mut doc| {
                doc.delete(black_box("alice"), black_box(0), black_box(3500));
                black_box(doc.text());
            },
            BatchSize::SmallInput,
        )
    });
}

fn bench_crdt_merge_sync(c: &mut Criterion) {
    c.bench_function("CRDT/merge/sync", |b| {
        b.iter_batched(
            || {
                let mut doc_a = Doc::new();
                let mut doc_b = Doc::new();

                // Both start with the same base content
                doc_a.insert("alice", 0, &content_of_len(200));
                doc_b.merge_from(&doc_a);

                // Divergent edits: each adds 500 chars
                doc_a.insert("alice", 100, &content_of_len(500));
                doc_b.insert("bob", 50, &content_of_len(500));

                (doc_a, doc_b)
            },
            |(mut doc_a, doc_b)| {
                doc_a.merge_from(black_box(&doc_b));
                black_box(doc_a.text());
            },
            BatchSize::SmallInput,
        )
    });
}

fn bench_crdt_serialize(c: &mut Criterion) {
    c.bench_function("CRDT/serialize/encode", |b| {
        b.iter_batched(
            || {
                let mut doc = Doc::new();
                doc.insert("alice", 0, &content_of_len(5000));
                doc
            },
            |doc| {
                let bytes = doc.encode();
                black_box(bytes.len());
            },
            BatchSize::SmallInput,
        )
    });
}

fn bench_crdt_deserialize(c: &mut Criterion) {
    c.bench_function("CRDT/serialize/decode", |b| {
        b.iter_batched(
            || {
                let mut doc = Doc::new();
                doc.insert("alice", 0, &content_of_len(5000));
                doc.encode()
            },
            |bytes| {
                let mut doc = Doc::new();
                doc.decode_and_add(black_box(&bytes));
                black_box(doc.text().len());
            },
            BatchSize::SmallInput,
        )
    });
}

fn bench_crdt_merge_large(c: &mut Criterion) {
    c.bench_function("CRDT/merge/large-sync-10k", |b| {
        b.iter_batched(
            || {
                let mut doc_a = Doc::new();
                let mut doc_b = Doc::new();

                // Both start with 5k base
                doc_a.insert("alice", 0, &content_of_len(5000));
                doc_b.merge_from(&doc_a);

                // Each side adds 5k divergent content
                doc_a.insert("alice", 2500, &content_of_len(5000));
                doc_b.insert("bob", 2500, &content_of_len(5000));

                (doc_a, doc_b)
            },
            |(mut doc_a, doc_b)| {
                doc_a.merge_from(black_box(&doc_b));
                black_box(doc_a.text().len());
            },
            BatchSize::SmallInput,
        )
    });
}

fn bench_crdt_three_way_merge(c: &mut Criterion) {
    c.bench_function("CRDT/merge/three-way", |b| {
        b.iter_batched(
            || {
                let mut doc_a = Doc::new();
                let mut doc_b = Doc::new();
                let mut doc_c = Doc::new();

                // Shared base
                doc_a.insert("alice", 0, &content_of_len(1000));
                doc_b.merge_from(&doc_a);
                doc_c.merge_from(&doc_a);

                // Three-way divergent
                doc_a.insert("alice", 500, "A");
                doc_b.insert("bob", 500, "B");
                doc_c.insert("carol", 500, "C");

                (doc_a, doc_b, doc_c)
            },
            |(mut doc_a, doc_b, doc_c)| {
                doc_a.merge_from(black_box(&doc_b));
                doc_a.merge_from(black_box(&doc_c));
                black_box(doc_a.text().len());
            },
            BatchSize::SmallInput,
        )
    });
}

criterion_group!(
    name = crdt_insert;
    config = Criterion::default().sample_size(50);
    targets =
        bench_crdt_insert_100,
        bench_crdt_insert_1000,
        bench_crdt_insert_10000,
);

criterion_group!(
    name = crdt_delete;
    config = Criterion::default().sample_size(50);
    targets =
        bench_crdt_delete_small,
        bench_crdt_delete_large,
);

criterion_group!(
    name = crdt_merge;
    config = Criterion::default().sample_size(30);
    targets =
        bench_crdt_merge_sync,
        bench_crdt_merge_large,
        bench_crdt_three_way_merge,
);

criterion_group!(
    name = crdt_serialize;
    config = Criterion::default().sample_size(50);
    targets =
        bench_crdt_serialize,
        bench_crdt_deserialize,
);

criterion_main!(crdt_insert, crdt_delete, crdt_merge, crdt_serialize);
