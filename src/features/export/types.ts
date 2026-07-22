/**
 * The exportable views this app knows how to assemble — deliberately
 * not a general "export anything" system. Paper Summary
 * (Milestone 10) and Literature Matrix (Milestone 11) are the app's
 * only two "generated after reading" outputs per
 * Design_Decisions.md's "Levels of information," so those were the
 * only two things Export turned into a file. Post-Milestone-13
 * bugfix pass adds a third: Bibliography, an APA7 reference list
 * assembled from every paper's catalog metadata rather than from
 * notebook/annotations content — a workspace-wide counterpart to
 * MetadataSection's per-paper "Copy APA7 Citation" button.
 */
export type ExportTarget = "paper-summary" | "literature-matrix" | "bibliography";
