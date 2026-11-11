import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import EditorMessage from "@/components/editor/editor-message";
import { formatBytes } from "@/helpers/format-bytes";
import { baseName } from "@/lib/paths";
import { imageQuery } from "@/queries/file-query";

/** A checkerboard behind the image, so transparent parts show as such. */
const CHECKERBOARD = {
  backgroundImage:
    "repeating-conic-gradient(var(--muted) 0 25%, transparent 0 50%)",
  backgroundSize: "16px 16px",
};

/** Shows an image file (see `imageMimeType`) at its own size, scaled down to fit. */
const ImagePreview = ({ path }: { path: string }) => {
  const { data, error, isPending } = useQuery(imageQuery(path));
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  // Created and revoked in one effect, so a URL is never revoked while still shown.
  useEffect(() => {
    if (data?.kind !== "image") return;
    const objectUrl = URL.createObjectURL(
      new Blob([data.data as Uint8Array<ArrayBuffer>], { type: data.mimeType }),
    );
    setUrl(objectUrl);
    setFailed(false);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [data]);

  if (isPending) return <div className="min-h-0 flex-1" />;

  if (error) {
    return (
      <EditorMessage title="Couldn't open this image" detail={error.message} />
    );
  }

  if (data.kind === "too-large") {
    return (
      <EditorMessage
        title="This image is too large to preview"
        detail={`${formatBytes(data.size)} (limit ${formatBytes(data.limit)})`}
      />
    );
  }

  if (failed) {
    return (
      <EditorMessage
        title="This image can't be shown"
        detail="The file may be damaged or in a format that isn't supported."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        {url && (
          <img
            src={url}
            alt={baseName(path)}
            className="max-h-full max-w-full object-contain"
            style={CHECKERBOARD}
            onLoad={(event) =>
              setSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <div className="flex h-7 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
        {size && (
          <span>
            {size.width} × {size.height}
          </span>
        )}
        <span>{formatBytes(data.size)}</span>
      </div>
    </div>
  );
};

export default ImagePreview;
