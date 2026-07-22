import "./AccordionSection.css";

export interface AccordionSectionProps {
  id: string;
  title: string;
  preview: string;
  isOpen: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}

export function AccordionSection({
  id,
  title,
  preview,
  isOpen,
  onToggle,
  children,
}: AccordionSectionProps) {
  return (
    <section className={`accordion-section${isOpen ? " is-open" : ""}`}>
      <button
        className="accordion-section__header"
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
      >
        <span className="accordion-section__spine" aria-hidden />
        <span className="accordion-section__title">{title}</span>
        {!isOpen && preview && (
          <span className="accordion-section__preview">{preview}</span>
        )}
        <span className="accordion-section__chevron" aria-hidden>
          {isOpen ? "\u2212" : "+"}
        </span>
      </button>

      {isOpen && <div className="accordion-section__body">{children}</div>}
    </section>
  );
}
