import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

import { cn } from "@/lib/utils";

import oscarLogo from "@/assets/oscar.png";
import { version } from "../../package.json";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

const platformNames: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};

function AboutPage() {
  const { platform, versions } = window.electron;

  const details = [
    { label: "Version", value: version },
    { label: "Electron", value: versions.electron },
    { label: "Chromium", value: versions.chrome },
    { label: "Node.js", value: versions.node },
    { label: "Platform", value: platformNames[platform] ?? platform },
  ];

  return (
    <div className="relative flex h-full items-center justify-center overflow-y-auto px-6 py-8">
      <Link
        to="/"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "absolute top-4 left-4 text-muted-foreground",
        )}
      >
        <ArrowLeftIcon />
        Back to editor
      </Link>

      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <img
            src={oscarLogo}
            alt=""
            draggable={false}
            className="mx-auto mb-4 size-16 select-none"
          />
          <h1 className="text-xl font-semibold">Oscar</h1>
          <p className="text-sm text-muted-foreground">
            A desktop code editor built with Electron and Monaco.
          </p>
        </div>

        <dl className="divide-y rounded-lg border text-sm">
          {details.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4 px-4 py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono select-text">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Himanshu Sinha
        </p>
      </div>
    </div>
  );
}
