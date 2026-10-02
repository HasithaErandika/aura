import { AUTH_STEPS } from "../lib/content.ts";

export function AuthorizationView() {
  return (
    <div className="mt-6 rounded-xl border border-line bg-canvas p-4 sm:p-6">
      <h4 className="text-base font-bold text-ink-900">How a step gets authorized</h4>
      <p className="mt-1 text-xs text-ink-600">Every tool call passes schema checks, role policy and a recorded human decision.</p>
      <ol className="mt-6 space-y-4 border-l-2 border-brand/30 pl-6">
        {AUTH_STEPS.map((step, i) => (
          <li key={step.title} className="relative">
            <span className="absolute top-0 -left-[37px] flex size-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-on-dark" aria-hidden>
              {i + 1}
            </span>
            <h5 className="text-xs font-bold text-ink-900">{step.title}</h5>
            <p className="text-xs text-ink-600">{step.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
