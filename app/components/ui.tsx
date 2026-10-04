"use client";

import Link from "next/link";
import { Fragment, useId, type ReactNode } from "react";
import type { Severity } from "../lib/job/types";
import { ChevronRight } from "./Icons";

export function Crumbs({ items }: { items: Array<{ href?: string; label: string }> }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <Fragment key={`${item.label}-${i}`}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

export function PageHead({ title, lede, children }: { title: string; lede?: string; children?: ReactNode }) {
  return (
    <div className="pageHead">
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {children}
    </div>
  );
}

export function Field({ label, hint, tag, children, htmlFor }: { label: string; hint?: string; tag?: string; children: (id: string) => ReactNode; htmlFor?: string }) {
  const generated = useId();
  const id = htmlFor ?? generated;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {tag && <span className="fieldTag">{tag}</span>}
      </label>
      {children(id)}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

type NumberFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  hint?: string;
  tag?: string;
  placeholder?: string;
};

/** Decimal text input. Blank stays blank: nothing is ever defaulted to zero. */
export function NumberField({ label, value, onChange, unit, hint, tag, placeholder }: NumberFieldProps) {
  return (
    <Field label={unit ? `${label} (${unit})` : label} hint={hint} tag={tag}>
      {(id) => <input id={id} inputMode="decimal" autoComplete="off" value={value} placeholder={placeholder ?? ""} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, hint, placeholder }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; hint?: string; placeholder?: string }) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function TextField({ label, value, onChange, hint, multiline, maxLength, placeholder }: { label: string; value: string; onChange: (value: string) => void; hint?: string; multiline?: boolean; maxLength?: number; placeholder?: string }) {
  return (
    <Field label={label} hint={hint}>
      {(id) =>
        multiline ? (
          <textarea id={id} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input id={id} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}

export function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Callout({ tone, title, children }: { tone?: "warn" | "safety" | "ok"; title?: string; children?: ReactNode }) {
  return (
    <div className="callout" data-tone={tone} role={tone === "safety" || tone === "warn" ? "alert" : undefined}>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}

export function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="callout" data-tone="warn" role="alert">
      <strong>{errors.length === 1 ? "Fix this to continue" : "Fix these to continue"}</strong>
      <ul>
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

export function Chip({ tone, children }: { tone?: "ok" | "accent" | "concern" | "safety"; children: ReactNode }) {
  return (
    <span className="chip" data-tone={tone}>
      {children}
    </span>
  );
}

export function SeverityChip({ severity }: { severity: Severity }) {
  const map: Record<Severity, { tone?: "ok" | "concern" | "safety"; label: string }> = {
    info: { label: "Recorded" },
    ok: { tone: "ok", label: "In range" },
    concern: { tone: "concern", label: "Needs attention" },
    safety: { tone: "safety", label: "Safety" },
  };
  const { tone, label } = map[severity];
  return <Chip tone={tone}>{label}</Chip>;
}

export function Plate({ title, rows }: { title?: string; rows: Array<{ label: string; value: string; unit?: string }> }) {
  return (
    <div className="plate">
      {title && <div className="plateTitle">{title}</div>}
      {rows.map((r) => (
        <div className="plateRow" key={r.label}>
          <span className="plateLabel">{r.label}</span>
          <span className="plateValue">
            {r.value}
            {r.unit && <small>{r.unit}</small>}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ResultCard({ tone, title, children }: { tone: "ok" | "concern" | "safety" | "info"; title: string; children: ReactNode }) {
  return (
    <section className="result" data-tone={tone} aria-live="polite">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {children}
    </div>
  );
}

export function ListLink({ href, title, meta, right, severity }: { href: string; title: string; meta?: string; right?: ReactNode; severity?: Severity }) {
  return (
    <Link className="listItem" href={href}>
      {severity && <span className="severityBar" data-severity={severity} aria-hidden="true" />}
      <span className="listBody">
        <span className="listTitle">{title}</span>
        {meta && <span className="listMeta" style={{ display: "block" }}>{meta}</span>}
      </span>
      {right}
      <ChevronRight className="listArrow" />
    </Link>
  );
}

export function ActionBar({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="actionbar noPrint">
      <div className="actionbarInner">
        {note && <p className="actionbarNote" role="status">{note}</p>}
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: { title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="dialogScrim" role="presentation" onClick={onCancel}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="dlg-title">{title}</h2>
        <p>{body}</p>
        <div className="btnRow">
          <button className="btn" type="button" onClick={onCancel}>
            Keep it
          </button>
          <button className="btn danger" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
