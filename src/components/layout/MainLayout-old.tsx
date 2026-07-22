import { PdfViewer } from "../../features/reader";
import { Paper } from "../../features/library";
import { Notebook } from "../../features/notebook";
import "./MainLayout.css";

export interface MainLayoutProps {
  paper: Paper | null;
  workspacePath: string;
  onPageInfo: (page: number, pageCount: number) => void;
  /** Bumped by App.tsx whenever a highlight is saved from the reader,
   * so Notebook (which owns its own excerpt list) knows to refetch. */
  excerptsVersion: number;
  onExcerptSaved: () => void;
  onViewSummary: () => void;
  onMetadataSaved: (updated: Paper) => void;
}

export function MainLayout({
  paper,
  workspacePath,
  onPageInfo,
  excerptsVersion,
  onExcerptSaved,
  onViewSummary,
  onMetadataSaved,
}: MainLayoutProps) {
  return (
    <main className="main-layout">
      <PdfViewer
        paper={paper}
        workspacePath={workspacePath}
        onPageInfo={onPageInfo}
        onExcerptSaved={onExcerptSaved}
      />
      <Notebook
        paper={paper}
        excerptsVersion={excerptsVersion}
        onViewSummary={onViewSummary}
        onMetadataSaved={onMetadataSaved}
      />
    </main>
  );
}
