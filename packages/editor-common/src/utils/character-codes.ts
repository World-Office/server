/**
 * Character codes, LCID values, Unicode ranges, and code pages.
 * Migrated from apps/web/apps/common/main/lib/util/character.js
 */

// Locale Identifier (LCID) constants
export const lcid_unknown = 0x0000
export const lcid_ar = 0x0001
export const lcid_bg = 0x0002
export const lcid_ca = 0x0003
export const lcid_zhHans = 0x0004
export const lcid_cs = 0x0005
export const lcid_da = 0x0006
export const lcid_de = 0x0007
export const lcid_el = 0x0008
export const lcid_en = 0x0009
export const lcid_es = 0x000a
export const lcid_fi = 0x000b
export const lcid_fr = 0x000c
export const lcid_he = 0x000d
export const lcid_hu = 0x000e
export const lcid_is = 0x000f
export const lcid_it = 0x0010
export const lcid_ja = 0x0011
export const lcid_ko = 0x0012
export const lcid_nl = 0x0013
export const lcid_no = 0x0014
export const lcid_pl = 0x0015
export const lcid_pt = 0x0016
export const lcid_rm = 0x0017
export const lcid_ro = 0x0018
export const lcid_ru = 0x0019
export const lcid_hr = 0x001a
export const lcid_sk = 0x001b
export const lcid_sq = 0x001c
export const lcid_sv = 0x001d
export const lcid_th = 0x001e
export const lcid_tr = 0x001f
export const lcid_ur = 0x0020
export const lcid_id = 0x0021
export const lcid_uk = 0x0022
export const lcid_be = 0x0023
export const lcid_sl = 0x0024
export const lcid_et = 0x0025
export const lcid_lv = 0x0026
export const lcid_lt = 0x0027
export const lcid_tg = 0x0028
export const lcid_fa = 0x0029
export const lcid_vi = 0x002a
export const lcid_hy = 0x002b
export const lcid_az = 0x002c
export const lcid_eu = 0x002d
export const lcid_hsb = 0x002e
export const lcid_mk = 0x002f
export const lcid_tn = 0x0032
export const lcid_xh = 0x0034
export const lcid_zu = 0x0035
export const lcid_af = 0x0036
export const lcid_ka = 0x0037
export const lcid_fo = 0x0038
export const lcid_hi = 0x0039
export const lcid_mt = 0x003a
export const lcid_se = 0x003b
export const lcid_ga = 0x003c
export const lcid_ms = 0x003e
export const lcid_kk = 0x003f
export const lcid_ky = 0x0040
export const lcid_sw = 0x0041
export const lcid_tk = 0x0042
export const lcid_uz = 0x0043
export const lcid_tt = 0x0044
export const lcid_bn = 0x0045
export const lcid_pa = 0x0046
export const lcid_gu = 0x0047
export const lcid_or = 0x0048
export const lcid_ta = 0x0049
export const lcid_te = 0x004a
export const lcid_kn = 0x004b
export const lcid_ml = 0x004c
export const lcid_as = 0x004d
export const lcid_mr = 0x004e
export const lcid_sa = 0x004f
export const lcid_mn = 0x0050
export const lcid_bo = 0x0051
export const lcid_cy = 0x0052
export const lcid_km = 0x0053
export const lcid_lo = 0x0054
export const lcid_gl = 0x0056
export const lcid_kok = 0x0057
export const lcid_syr = 0x005a
export const lcid_si = 0x005b
export const lcid_iu = 0x005d
export const lcid_am = 0x005e
export const lcid_tzm = 0x005f
export const lcid_ne = 0x0061
export const lcid_fy = 0x0062
export const lcid_ps = 0x0063
export const lcid_fil = 0x0064
export const lcid_dv = 0x0065
export const lcid_ha = 0x0068
export const lcid_yo = 0x006a
export const lcid_quz = 0x006b
export const lcid_nso = 0x006c
export const lcid_ba = 0x006d
export const lcid_lb = 0x006e
export const lcid_kl = 0x006f
export const lcid_ig = 0x0070
export const lcid_ii = 0x0078
export const lcid_arn = 0x007a
export const lcid_moh = 0x007c
export const lcid_br = 0x007e
export const lcid_ug = 0x0080
export const lcid_mi = 0x0081
export const lcid_oc = 0x0082
export const lcid_co = 0x0083
export const lcid_gsw = 0x0084
export const lcid_sah = 0x0085
export const lcid_qut = 0x0086
export const lcid_rw = 0x0087
export const lcid_wo = 0x0088
export const lcid_prs = 0x008c
export const lcid_gd = 0x0091
export const lcid_arSA = 0x0401
export const lcid_bgBG = 0x0402
export const lcid_caES = 0x0403
export const lcid_zhTW = 0x0404
export const lcid_csCZ = 0x0405
export const lcid_daDK = 0x0406
export const lcid_deDE = 0x0407
export const lcid_elGR = 0x0408
export const lcid_enUS = 0x0409
export const lcid_esES_tradnl = 0x040a
export const lcid_fiFI = 0x040b
export const lcid_frFR = 0x040c
export const lcid_heIL = 0x040d
export const lcid_huHU = 0x040e
export const lcid_isIS = 0x040f
export const lcid_itIT = 0x0410
export const lcid_jaJP = 0x0411
export const lcid_koKR = 0x0412
export const lcid_nlNL = 0x0413
export const lcid_nbNO = 0x0414
export const lcid_plPL = 0x0415
export const lcid_ptBR = 0x0416
export const lcid_rmCH = 0x0417
export const lcid_roRO = 0x0418
export const lcid_ruRU = 0x0419
export const lcid_hrHR = 0x041a
export const lcid_skSK = 0x041b
export const lcid_sqAL = 0x041c
export const lcid_svSE = 0x041d
export const lcid_thTH = 0x041e
export const lcid_trTR = 0x041f
export const lcid_urPK = 0x0420
export const lcid_idID = 0x0421
export const lcid_ukUA = 0x0422
export const lcid_beBY = 0x0423
export const lcid_slSI = 0x0424
export const lcid_etEE = 0x0425
export const lcid_lvLV = 0x0426
export const lcid_ltLT = 0x0427
export const lcid_tgCyrlTJ = 0x0428
export const lcid_faIR = 0x0429
export const lcid_viVN = 0x042a
export const lcid_hyAM = 0x042b
export const lcid_azLatnAZ = 0x042c
export const lcid_euES = 0x042d
export const lcid_wenDE = 0x042e
export const lcid_mkMK = 0x042f
export const lcid_stZA = 0x0430
export const lcid_tsZA = 0x0431
export const lcid_tnZA = 0x0432
export const lcid_venZA = 0x0433
export const lcid_xhZA = 0x0434
export const lcid_zuZA = 0x0435
export const lcid_afZA = 0x0436
export const lcid_kaGE = 0x0437
export const lcid_foFO = 0x0438
export const lcid_hiIN = 0x0439
export const lcid_mtMT = 0x043a
export const lcid_seNO = 0x043b
export const lcid_msMY = 0x043e
export const lcid_kkKZ = 0x043f
export const lcid_kyKG = 0x0440
export const lcid_swKE = 0x0441
export const lcid_tkTM = 0x0442
export const lcid_uzLatnUZ = 0x0443
export const lcid_ttRU = 0x0444
export const lcid_bnIN = 0x0445
export const lcid_paIN = 0x0446
export const lcid_guIN = 0x0447
export const lcid_orIN = 0x0448
export const lcid_taIN = 0x0449
export const lcid_teIN = 0x044a
export const lcid_knIN = 0x044b
export const lcid_mlIN = 0x044c
export const lcid_asIN = 0x044d
export const lcid_mrIN = 0x044e
export const lcid_saIN = 0x044f
export const lcid_mnMN = 0x0450
export const lcid_boCN = 0x0451
export const lcid_cyGB = 0x0452
export const lcid_kmKH = 0x0453
export const lcid_loLA = 0x0454
export const lcid_myMM = 0x0455
export const lcid_glES = 0x0456
export const lcid_kokIN = 0x0457
export const lcid_mni = 0x0458
export const lcid_sdIN = 0x0459
export const lcid_syrSY = 0x045a
export const lcid_siLK = 0x045b
export const lcid_chrUS = 0x045c
export const lcid_iuCansCA = 0x045d
export const lcid_amET = 0x045e
export const lcid_tmz = 0x045f
export const lcid_neNP = 0x0461
export const lcid_fyNL = 0x0462
export const lcid_psAF = 0x0463
export const lcid_filPH = 0x0464
export const lcid_dvMV = 0x0465
export const lcid_binNG = 0x0466
export const lcid_fuvNG = 0x0467
export const lcid_haLatnNG = 0x0468
export const lcid_ibbNG = 0x0469
export const lcid_yoNG = 0x046a
export const lcid_quzBO = 0x046b
export const lcid_nsoZA = 0x046c
export const lcid_baRU = 0x046d
export const lcid_lbLU = 0x046e
export const lcid_klGL = 0x046f
export const lcid_igNG = 0x0470
export const lcid_krNG = 0x0471
export const lcid_gazET = 0x0472
export const lcid_tiER = 0x0473
export const lcid_gnPY = 0x0474
export const lcid_hawUS = 0x0475
export const lcid_soSO = 0x0477
export const lcid_iiCN = 0x0478
export const lcid_papAN = 0x0479
export const lcid_arnCL = 0x047a
export const lcid_mohCA = 0x047c
export const lcid_brFR = 0x047e
export const lcid_ugCN = 0x0480
export const lcid_miNZ = 0x0481
export const lcid_ocFR = 0x0482
export const lcid_coFR = 0x0483
export const lcid_gswFR = 0x0484
export const lcid_sahRU = 0x0485
export const lcid_qutGT = 0x0486
export const lcid_rwRW = 0x0487
export const lcid_woSN = 0x0488
export const lcid_prsAF = 0x048c
export const lcid_pltMG = 0x048d
export const lcid_gdGB = 0x0491
export const lcid_arIQ = 0x0801
export const lcid_zhCN = 0x0804
export const lcid_deCH = 0x0807
export const lcid_enGB = 0x0809
export const lcid_esMX = 0x080a
export const lcid_frBE = 0x080c
export const lcid_itCH = 0x0810
export const lcid_nlBE = 0x0813
export const lcid_nnNO = 0x0814
export const lcid_ptPT = 0x0816
export const lcid_roMO = 0x0818
export const lcid_ruMO = 0x0819
export const lcid_srLatnCS = 0x081a
export const lcid_svFI = 0x081d
export const lcid_urIN = 0x0820
export const lcid_azCyrlAZ = 0x082c
export const lcid_dsbDE = 0x082e
export const lcid_seSE = 0x083b
export const lcid_gaIE = 0x083c
export const lcid_msBN = 0x083e
export const lcid_uzCyrlUZ = 0x0843
export const lcid_bnBD = 0x0845
export const lcid_paPK = 0x0846
export const lcid_mnMongCN = 0x0850
export const lcid_boBT = 0x0851
export const lcid_sdPK = 0x0859
export const lcid_iuLatnCA = 0x085d
export const lcid_tzmLatnDZ = 0x085f
export const lcid_neIN = 0x0861
export const lcid_quzEC = 0x086b
export const lcid_tiET = 0x0873
export const lcid_arEG = 0x0c01
export const lcid_zhHK = 0x0c04
export const lcid_deAT = 0x0c07
export const lcid_enAU = 0x0c09
export const lcid_esES = 0x0c0a
export const lcid_frCA = 0x0c0c
export const lcid_srCyrlCS = 0x0c1a
export const lcid_seFI = 0x0c3b
export const lcid_tmzMA = 0x0c5f
export const lcid_quzPE = 0x0c6b
export const lcid_arLY = 0x1001
export const lcid_zhSG = 0x1004
export const lcid_deLU = 0x1007
export const lcid_enCA = 0x1009
export const lcid_esGT = 0x100a
export const lcid_frCH = 0x100c
export const lcid_hrBA = 0x101a
export const lcid_smjNO = 0x103b
export const lcid_arDZ = 0x1401
export const lcid_zhMO = 0x1404
export const lcid_deLI = 0x1407
export const lcid_enNZ = 0x1409
export const lcid_esCR = 0x140a
export const lcid_frLU = 0x140c
export const lcid_bsLatnBA = 0x141a
export const lcid_smjSE = 0x143b
export const lcid_arMA = 0x1801
export const lcid_enIE = 0x1809
export const lcid_esPA = 0x180a
export const lcid_frMC = 0x180c
export const lcid_srLatnBA = 0x181a
export const lcid_smaNO = 0x183b
export const lcid_arTN = 0x1c01
export const lcid_enZA = 0x1c09
export const lcid_esDO = 0x1c0a
export const lcid_frWest = 0x1c0c
export const lcid_srCyrlBA = 0x1c1a
export const lcid_smaSE = 0x1c3b
export const lcid_arOM = 0x2001
export const lcid_enJM = 0x2009
export const lcid_esVE = 0x200a
export const lcid_frRE = 0x200c
export const lcid_bsCyrlBA = 0x201a
export const lcid_smsFI = 0x203b
export const lcid_arYE = 0x2401
export const lcid_enCB = 0x2409
export const lcid_esCO = 0x240a
export const lcid_frCG = 0x240c
export const lcid_srLatnRS = 0x241a
export const lcid_smnFI = 0x243b
export const lcid_arSY = 0x2801
export const lcid_enBZ = 0x2809
export const lcid_esPE = 0x280a
export const lcid_frSN = 0x280c
export const lcid_srCyrlRS = 0x281a
export const lcid_arJO = 0x2c01
export const lcid_enTT = 0x2c09
export const lcid_esAR = 0x2c0a
export const lcid_frCM = 0x2c0c
export const lcid_srLatnME = 0x2c1a
export const lcid_arLB = 0x3001
export const lcid_enZW = 0x3009
export const lcid_esEC = 0x300a
export const lcid_frCI = 0x300c
export const lcid_srCyrlME = 0x301a
export const lcid_arKW = 0x3401
export const lcid_enPH = 0x3409
export const lcid_esCL = 0x340a
export const lcid_frML = 0x340c
export const lcid_arAE = 0x3801
export const lcid_enID = 0x3809
export const lcid_esUY = 0x380a
export const lcid_frMA = 0x380c
export const lcid_arBH = 0x3c01
export const lcid_enHK = 0x3c09
export const lcid_esPY = 0x3c0a
export const lcid_frHT = 0x3c0c
export const lcid_arQA = 0x4001
export const lcid_enIN = 0x4009
export const lcid_esBO = 0x400a
export const lcid_enMY = 0x4409
export const lcid_esSV = 0x440a
export const lcid_enSG = 0x4809
export const lcid_esHN = 0x480a
export const lcid_esNI = 0x4c0a
export const lcid_esPR = 0x500a
export const lcid_esUS = 0x540a
export const lcid_bsCyrl = 0x641a
export const lcid_bsLatn = 0x681a
export const lcid_srCyrl = 0x6c1a
export const lcid_srLatn = 0x701a
export const lcid_smn = 0x703b
export const lcid_azCyrl = 0x742c
export const lcid_sms = 0x743b
export const lcid_zh = 0x7804
export const lcid_nn = 0x7814
export const lcid_bs = 0x781a
export const lcid_azLatn = 0x782c
export const lcid_sma = 0x783b
export const lcid_uzCyrl = 0x7843
export const lcid_mnCyrl = 0x7850
export const lcid_iuCans = 0x785d
export const lcid_zhHant = 0x7c04
export const lcid_nb = 0x7c14
export const lcid_sr = 0x7c1a
export const lcid_tgCyrl = 0x7c28
export const lcid_dsb = 0x7c2e
export const lcid_smj = 0x7c3b
export const lcid_uzLatn = 0x7c43
export const lcid_mnMong = 0x7c50
export const lcid_iuLatn = 0x7c5d
export const lcid_tzmLatn = 0x7c5f
export const lcid_haLatn = 0x7c68

export const UnicodeRangesLID = {
  Unknown: 0,
  Basic_Latin: 1,
  Latin_1_Supplement: 2,
  Latin_Extended_A: 3,
  Latin_Extended_B: 4,
  IPA_Extensions: 5,
  Spacing_Modifier_Letters: 6,
  Combining_Diacritical_Marks: 7,
  Greek_and_Coptic: 8,
  Cyrillic: 9,
  Cyrillic_Supplement: 10,
  Armenian: 11,
  Hebrew: 12,
  Arabic: 13,
  Syriac: 14,
  Arabic_Supplement: 15,
  Thaana: 16,
  NKo: 17,
  Samaritan: 18,
  Mandaic: 19,
  Arabic_Extended_A: 20,
  Devanagari: 21,
  Bengali: 22,
  Gurmukhi: 23,
  Gujarati: 24,
  Oriya: 25,
  Tamil: 26,
  Telugu: 27,
  Kannada: 28,
  Malayalam: 29,
  Sinhala: 30,
  Thai: 31,
  Lao: 32,
  Tibetan: 33,
  Myanmar: 34,
  Georgian: 35,
  Hangul_Jamo: 36,
  Ethiopic: 37,
  Ethiopic_Supplement: 38,
  Cherokee: 39,
  Unified_Canadian_Aboriginal_Syllabics: 40,
  Ogham: 41,
  Runic: 42,
  Tagalog: 43,
  Hanunoo: 44,
  Buhid: 45,
  Tagbanwa: 46,
  Khmer: 47,
  Mongolian: 48,
  Unified_Canadian_Aboriginal_Syllabics_Extended: 49,
  Limbu: 50,
  Tai_Le: 51,
  New_Tai_Lue: 52,
  Khmer_Symbols: 53,
  Buginese: 54,
  Tai_Tham: 55,
  Combining_Diacritical_Marks_Extended: 56,
  Balinese: 57,
  Sundanese: 58,
  Batak: 59,
  Lepcha: 60,
  Ol_Chiki: 61,
  Cyrillic_Extended_C: 62,
  Sundanese_Supplement: 63,
  Vedic_Extensions: 64,
  Phonetic_Extensions: 65,
  Phonetic_Extensions_Supplement: 66,
  Combining_Diacritical_Marks_Supplement: 67,
  Latin_Extended_Additional: 68,
  Greek_Extended: 69,
  General_Punctuation: 70,
  Superscripts_and_Subscripts: 71,
  Currency_Symbols: 72,
  Combining_Diacritical_Marks_for_Symbols: 73,
  Letterlike_Symbols: 74,
  Number_Forms: 75,
  Arrows: 76,
  Mathematical_Operators: 77,
  Miscellaneous_Technical: 78,
  Control_Pictures: 79,
  Optical_Character_Recognition: 80,
  Enclosed_Alphanumerics: 81,
  Box_Drawing: 82,
  Block_Elements: 83,
  Geometric_Shapes: 84,
  Miscellaneous_Symbols: 85,
  Dingbats: 86,
  Miscellaneous_Mathematical_Symbols_A: 87,
  Supplemental_Arrows_A: 88,
  Braille_Patterns: 89,
  Supplemental_Arrows_B: 90,
  Miscellaneous_Mathematical_Symbols_B: 91,
  Supplemental_Mathematical_Operators: 92,
  Miscellaneous_Symbols_and_Arrows: 93,
  Glagolitic: 94,
  Latin_Extended_C: 95,
  Coptic: 96,
  Georgian_Supplement: 97,
  Tifinagh: 98,
  Ethiopic_Extended: 99,
  Cyrillic_Extended_A: 100,
  Supplemental_Punctuation: 101,
  CJK_Radicals_Supplement: 102,
  Kangxi_Radicals: 103,
  Ideographic_Description_Characters: 104,
  CJK_Symbols_and_Punctuation: 105,
  Hiragana: 106,
  Katakana: 107,
  Bopomofo: 108,
  Hangul_Compatibility_Jamo: 109,
  Kanbun: 110,
  Bopomofo_Extended: 111,
  CJK_Strokes: 112,
  Katakana_Phonetic_Extensions: 113,
  Enclosed_CJK_Letters_and_Months: 114,
  CJK_Compatibility: 115,
  CJK_Unified_Ideographs_Extension: 116,
  Yijing_Hexagram_Symbols: 117,
  CJK_Unified_Ideographs: 118,
  Yi_Syllables: 119,
  Yi_Radicals: 120,
  Lisu: 121,
  Vai: 122,
  Cyrillic_Extended_B: 123,
  Bamum: 124,
  Modifier_Tone_Letters: 125,
  Latin_Extended_D: 126,
  Syloti_Nagri: 127,
  Common_Indic_Number_Forms: 128,
  Phags_pa: 129,
  Saurashtra: 130,
  Devanagari_Extended: 131,
  Kayah_Li: 132,
  Rejang: 133,
  Hangul_Jamo_Extended_A: 134,
  Javanese: 135,
  Myanmar_Extended_B: 136,
  Cham: 137,
  Myanmar_Extended_A: 138,
  Tai_Viet: 139,
  Meetei_Mayek_Extensions: 140,
  Ethiopic_Extended_A: 141,
  Latin_Extended_E: 142,
  Cherokee_Supplement: 143,
  Meetei_Mayek: 144,
  Hangul_Syllables: 145,
  Hangul_Jamo_Extended_B: 146,
  High_Surrogates: 147,
  High_Private_Use_Surrogates: 148,
  Low_Surrogates: 149,
  Private_Use_Area: 150,
  CJK_Compatibility_Ideographs: 151,
  Alphabetic_Presentation_Forms: 152,
  Arabic_Presentation_Forms_A: 153,
  Variation_Selectors: 154,
  Vertical_Forms: 155,
  Combining_Half_Marks: 156,
  CJK_Compatibility_Forms: 157,
  Small_Form_Variants: 158,
  Arabic_Presentation_Forms_B: 159,
  Halfwidth_and_Fullwidth_Forms: 160,
  Specials: 161,
  Linear_B_Syllabary: 162,
  Linear_B_Ideograms: 163,
  Aegean_Numbers: 164,
  Ancient_Greek_Numbers: 165,
  Ancient_Symbols: 166,
  Phaistos_Disc: 167,
  Lycian: 168,
  Carian: 169,
  Coptic_Epact_Numbers: 170,
  Old_Italic: 171,
  Gothic: 172,
  Old_Permic: 173,
  Ugaritic: 174,
  Old_Persian: 175,
  Deseret: 176,
  Shavian: 177,
  Osmanya: 178,
  Osage: 179,
  Elbasan: 180,
  Caucasian_Albanian: 181,
  Linear_A: 182,
  Cypriot_Syllabary: 183,
  Imperial_Aramaic: 184,
  Palmyrene: 185,
  Nabataean: 186,
  Hatran: 187,
  Phoenician: 188,
  Lydian: 189,
  Meroitic_Hieroglyphs: 190,
  Meroitic_Cursive: 191,
  Kharoshthi: 192,
  Old_South_Arabian: 193,
  Old_North_Arabian: 194,
  Manichaean: 195,
  Avestan: 196,
  Inscriptional_Parthian: 197,
  Inscriptional_Pahlavi: 198,
  Psalter_Pahlavi: 199,
  Old_Turkic: 200,
  Old_Hungarian: 201,
  Rumi_Numeral_Symbols: 202,
  Brahmi: 203,
  Kaithi: 204,
  Sora_Sompeng: 205,
  Chakma: 206,
  Mahajani: 207,
  Sharada: 208,
  Sinhala_Archaic_Numbers: 209,
  Khojki: 210,
  Multani: 211,
  Khudawadi: 212,
  Grantha: 213,
  Newa: 214,
  Tirhuta: 215,
  Siddham: 216,
  Modi: 217,
  Mongolian_Supplement: 218,
  Takri: 219,
  Ahom: 220,
  Warang_Citi: 221,
  Pau_Cin_Hau: 222,
  Bhaiksuki: 223,
  Marchen: 224,
  Cuneiform: 225,
  Cuneiform_Numbers_and_Punctuation: 226,
  Early_Dynastic_Cuneiform: 227,
  Egyptian_Hieroglyphs: 228,
  Anatolian_Hieroglyphs: 229,
  Bamum_Supplement: 230,
  Mro: 231,
  Bassa_Vah: 232,
  Pahawh_Hmong: 233,
  Miao: 234,
  Ideographic_Symbols_and_Punctuation: 235,
  Tangut: 236,
  Tangut_Components: 237,
  Kana_Supplement: 238,
  Duployan: 239,
  Shorthand_Format_Controls: 240,
  Byzantine_Musical_Symbols: 241,
  Musical_Symbols: 242,
  Ancient_Greek_Musical_Notation: 243,
  Tai_Xuan_Jing_Symbols: 244,
  Counting_Rod_Numerals: 245,
  Mathematical_Alphanumeric_Symbols: 246,
  Sutton_SignWriting: 247,
  Glagolitic_Supplement: 248,
  Mende_Kikakui: 249,
  Adlam: 250,
  Arabic_Mathematical_Alphabetic_Symbols: 251,
  Mahjong_Tiles: 252,
  Domino_Tiles: 253,
  Playing_Cards: 254,
  Enclosed_Alphanumeric_Supplement: 255,
  Enclosed_Ideographic_Supplement: 256,
  Miscellaneous_Symbols_and_Pictographs: 257,
  Emoticons: 258,
  Ornamental_Dingbats: 259,
  Transport_and_Map_Symbols: 260,
  Alchemical_Symbols: 261,
  Geometric_Shapes_Extended: 262,
  Supplemental_Arrows_C: 263,
  Supplemental_Symbols_and_Pictographs: 264,
  CJK_Unified_Ideographs_Extension_B: 265,
  CJK_Unified_Ideographs_Extension_C: 266,
  CJK_Unified_Ideographs_Extension_D: 267,
  CJK_Unified_Ideographs_Extension_E: 268,
  CJK_Compatibility_Ideographs_Supplement: 269,
  Tags: 270,
  Variation_Selectors_Supplement: 271,
  Supplementary_Private_Use_Area_A: 272,
  Supplementary_Private_Use_Area_B: 273,
} as const

export type UnicodeRangesLID = (typeof UnicodeRangesLID)[keyof typeof UnicodeRangesLID]

export const CodePagesOS2_1 = {
  Latin_1: 0,
  Latin_2: 1,
  Cyrillic: 2,
  Greek: 3,
  Turkish: 4,
  Hebrew: 5,
  Arabic: 6,
  Windows_Baltic: 7,
  Vietnamese: 8,
  Thai: 16,
  JIS_Japan: 17,
  Chinese_Simplified: 18,
  Korean_Wansung: 19,
  Chinese_Traditional: 20,
  Korean_Johab: 21,
  Macintosh_Character_Set_US_Roman: 29,
  OEM_Character_Set: 30,
  Symbol_Character_Set: 31,
} as const

export type CodePagesOS2_1 = (typeof CodePagesOS2_1)[keyof typeof CodePagesOS2_1]

export const CodePagesOS2_2 = {
  IBM_Greek: 48 - 32,
  MS_DOS_Russian: 49 - 32,
  MS_DOS_Nordic: 50 - 32,
  Arabic: 51 - 32,
  MS_DOS_Canadian_French: 52 - 32,
  Hebrew: 53 - 32,
  MS_DOS_Icelandic: 54 - 32,
  MS_DOS_Portuguese: 55 - 32,
  IBM_Turkish: 56 - 32,
  IBM_Cyrillic: 57 - 32,
  Latin_2: 58 - 32,
  MS_DOS_Baltic: 59 - 32,
  Greek_437: 60 - 32,
  Arabic_708: 61 - 32,
  WE_Latin_1: 62 - 32,
  US: 63 - 32,
} as const

export type CodePagesOS2_2 = (typeof CodePagesOS2_2)[keyof typeof CodePagesOS2_2]

export const UnicodeRangeOS2_1 = {
  Basic_Latin: 0,
  Latin_1_Supplement: 1,
  Latin_Extended_A: 2,
  Latin_Extended_B: 3,
  IPA_Extensions: 4,
  Spacing_Modifier_Letters: 5,
  Combining_Diacritical_Marks: 6,
  Greek_and_Coptic: 7,
  Coptic: 8,
  Cyrillic: 9,
  Armenian: 10,
  Hebrew: 11,
  Vai: 12,
  Arabic: 13,
  NKo: 14,
  Devanagari: 15,
  Bengali: 16,
  Gurmukhi: 17,
  Gujarati: 18,
  Oriya: 19,
  Tamil: 20,
  Telugu: 21,
  Kannada: 22,
  Malayalam: 23,
  Thai: 24,
  Lao: 25,
  Georgian: 26,
  Balinese: 27,
  Hangul_Jamo: 28,
  Latin_Extended_Additional: 29,
  Greek_Extended: 30,
  General_Punctuation: 31,
} as const

export type UnicodeRangeOS2_1 = (typeof UnicodeRangeOS2_1)[keyof typeof UnicodeRangeOS2_1]

export const UnicodeRangeOS2_2 = {
  Superscripts_And_Subscripts: 32 - 32,
  Currency_Symbols: 33 - 32,
  Combining_Diacritical_Marks_For_Symbols: 34 - 32,
  Letterlike_Symbols: 35 - 32,
  Number_Forms: 36 - 32,
  Arrows: 37 - 32,
  Mathematical_Operators: 38 - 32,
  Miscellaneous_Technical: 39 - 32,
  Control_Pictures: 40 - 32,
  Optical_Character_Recognition: 41 - 32,
  Enclosed_Alphanumerics: 42 - 32,
  Box_Drawing: 43 - 32,
  Block_Elements: 44 - 32,
  Geometric_Shapes: 45 - 32,
  Miscellaneous_Symbols: 46 - 32,
  Dingbats: 47 - 32,
  CJK_Symbols_And_Punctuation: 48 - 32,
  Hiragana: 49 - 32,
  Katakana: 50 - 32,
  Bopomofo: 51 - 32,
  Hangul_Compatibility_Jamo: 52 - 32,
  Phags_pa: 53 - 32,
  Enclosed_CJK_Letters_And_Months: 54 - 32,
  CJK_Compatibility: 55 - 32,
  Hangul_Syllables: 56 - 32,
  Non_Plane: 57 - 32,
  Phoenician: 58 - 32,
  CJK_Unified_Ideographs: 59 - 32,
  Private_Use_Area_plane_0: 60 - 32,
  CJK_Strokes: 61 - 32,
  Alphabetic_Presentation_Forms: 62 - 32,
  Arabic_Presentation_Forms_A: 63 - 32,
} as const

export type UnicodeRangeOS2_2 = (typeof UnicodeRangeOS2_2)[keyof typeof UnicodeRangeOS2_2]

export const UnicodeRangeOS2_3 = {
  Combining_Half_Marks: 64 - 64,
  Vertical_Forms: 65 - 64,
  Small_Form_Variants: 66 - 64,
  Arabic_Presentation_Forms_B: 67 - 64,
  Halfwidth_And_Fullwidth_Forms: 68 - 64,
  Specials: 69 - 64,
  Tibetan: 70 - 64,
  Syriac: 71 - 64,
  Thaana: 72 - 64,
  Sinhala: 73 - 64,
  Myanmar: 74 - 64,
  Ethiopic: 75 - 64,
  Cherokee: 76 - 64,
  Unified_Canadian_Aboriginal_Syllabics: 77 - 64,
  Ogham: 78 - 64,
  Runic: 79 - 64,
  Khmer: 80 - 64,
  Mongolian: 81 - 64,
  Braille_Patterns: 82 - 64,
  Yi_Syllables: 83 - 64,
  Tagalog: 84 - 64,
  Old_Italic: 85 - 64,
  Gothic: 86 - 64,
  Deseret: 87 - 64,
  Byzantine_Musical_Symbols: 88 - 64,
  Mathematical_Alphanumeric_Symbols: 89 - 64,
  Private_Use_plane_15: 90 - 64,
  Variation_Selectors: 91 - 64,
  Tags: 92 - 64,
  Limbu: 93 - 64,
  Tai_Le: 94 - 64,
  New_Tai_Lue: 95 - 64,
} as const

export type UnicodeRangeOS2_3 = (typeof UnicodeRangeOS2_3)[keyof typeof UnicodeRangeOS2_3]

export const UnicodeRangeOS2_4 = {
  Buginese: 96 - 96,
  Glagolitic: 97 - 96,
  Tifinagh: 98 - 96,
  Yijing_Hexagram_Symbols: 99 - 96,
  Syloti_Nagri: 100 - 96,
  Linear_B_Syllabary: 101 - 96,
  Ancient_Greek_Numbers: 102 - 96,
  Ugaritic: 103 - 96,
  Old_Persian: 104 - 96,
  Shavian: 105 - 96,
  Osmanya: 106 - 96,
  Cypriot_Syllabary: 107 - 96,
  Kharoshthi: 108 - 96,
  Tai_Xuan_Jing_Symbols: 109 - 96,
  Cuneiform: 110 - 96,
  Counting_Rod_Numerals: 111 - 96,
  Sundanese: 112 - 96,
  Lepcha: 113 - 96,
  Ol_Chiki: 114 - 96,
  Saurashtra: 115 - 96,
  Kayah_Li: 116 - 96,
  Rejang: 117 - 96,
  Cham: 118 - 96,
  Ancient_Symbols: 119 - 96,
  Phaistos_Disc: 120 - 96,
  Carian: 121 - 96,
  Domino_Tiles: 122 - 96,
} as const

export type UnicodeRangeOS2_4 = (typeof UnicodeRangeOS2_4)[keyof typeof UnicodeRangeOS2_4]

/** Unicode range entry. */
export interface UnicodeRange {
  Start: number
  End: number
  Name: number
  Lid: number
  Param: number[]
}
