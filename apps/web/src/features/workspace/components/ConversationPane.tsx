import type { ReactNode } from "react";

export function ConversationPane({ notices, children, footer }: { notices?: ReactNode; children: ReactNode; footer: ReactNode }) {
  return (
    <>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-4xl space-y-4">
          {notices}
          {children}
        </div>
      </div>
      <div className="border-t border-line bg-surface px-4 py-3 sm:px-8">
        <div className="mx-auto max-w-4xl">{footer}</div>
      </div>
    </>
  );
}
