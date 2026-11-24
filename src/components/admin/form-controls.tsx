import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const baseField =
  "w-full rounded-md border border-paper-300 bg-white px-3 py-2 text-[13px] text-ink-900 transition-colors outline-none placeholder:text-ink-400 focus:border-ink-700 disabled:bg-paper-100 disabled:text-ink-400";

export function Field({
  label,
  htmlFor,
  hint,
  children,
  required,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[11px] font-medium text-ink-700">
        {label}
        {required && <span className="ml-0.5 text-clay-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-ink-400">{hint}</p>}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${baseField} ${className}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea {...rest} className={`${baseField} resize-y leading-relaxed ${className}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return <select {...rest} className={`${baseField} ${className}`} />;
}

export function FormActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>;
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-md bg-ink-950 px-3.5 py-2 text-[12px] font-medium text-paper-50 transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-md border border-paper-300 px-3.5 py-2 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-950 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-md border border-clay-200 px-3 py-1.5 text-[12px] font-medium text-clay-600 transition-colors hover:bg-clay-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-paper-300 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-paper-200 px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-950">{title}</h2>
          {description && <p className="mt-0.5 text-[12px] text-ink-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}
