"use client";

export function WhatsAppButton({ phone, invoiceNumber }: { phone: string; invoiceNumber: string }) {
  const digits = phone.replace(/\D/g, "");
  let normalized = digits;
  if (digits.startsWith("0") && digits.length >= 10) normalized = `92${digits.slice(1)}`;
  else if (digits.length === 10) normalized = `92${digits}`;
  const ok = normalized.length >= 11;
  if (!ok || phone === "N/A") {
    return (
      <button type="button" className="btn btn-ghost ring-1 ring-line opacity-50" disabled title="Need a valid mobile">
        WhatsApp PDF
      </button>
    );
  }
  const text = encodeURIComponent(`Invoice ${invoiceNumber} from New College Book Depot & Stationers`);
  return (
    <a
      className="btn btn-ghost ring-1 ring-line no-underline"
      href={`https://wa.me/${normalized}?text=${text}`}
      target="_blank"
      rel="noreferrer"
      onClick={() => window.print()}
    >
      WhatsApp PDF
    </a>
  );
}
