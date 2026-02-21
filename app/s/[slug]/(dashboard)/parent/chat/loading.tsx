import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="flex h-full">
      <div className="w-64 border-r p-4 space-y-3 hidden md:block">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-16 w-3/4 rounded-xl" />
        <Skeleton className="h-16 w-1/2 rounded-xl ml-auto" />
        <Skeleton className="h-16 w-3/4 rounded-xl" />
      </div>
    </div>
  );
}
