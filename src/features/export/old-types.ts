/**
 * The two exportable views this app already knows how to assemble —
 * deliberately not a general "export anything" system. Paper Summary
 * (Milestone 10) and Literature Matrix (Milestone 11) are the app's
 * only two "generated after reading" outputs per
 * Design_Decisions.md's "Levels of information," so those are the
 * only two things Export turns into a file.
 */
export type ExportTarget = "paper-summary" | "literature-matrix";
