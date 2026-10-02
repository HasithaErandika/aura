import { Alert } from "./Alert.tsx";
import { Button } from "./Button.tsx";

export function ErrorAlert({ error, onRetry, className }: { error: string; onRetry?: () => void; className?: string }) {
  return (
    <Alert
      tone="danger"
      className={className}
      actions={
        onRetry ? (
          <Button size="sm" variant="ghost" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {error}
    </Alert>
  );
}
