import { Card, Skeleton } from "@/components/ui/card";

/**
 * - App loading skeleton
 * Shown while a signed-in route's first shell streams in: the page title and
 * two placeholder account cards.
 */
export default function Loading() {
  return (
    <div>
      <Skeleton className="h-7 w-40" />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {[0, 1].map((index) => (
          <Card key={index} className="border p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-4 h-9 w-44" />
            <Skeleton className="mt-4 h-3 w-48" />
          </Card>
        ))}
      </div>
    </div>
  );
}
