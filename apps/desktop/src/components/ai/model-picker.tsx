import { useQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronDownIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";

import ProviderIcon from "@/components/ai/provider-icon";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { ChatModel } from "@/hooks/use-ai-chat";
import { cn } from "@/lib/utils";
import { aiModelsQuery } from "@/queries/ai-models-query";

const OptionRow = ({
  isSelected,
  onSelect,
  className,
  children,
}: {
  isSelected: boolean;
  onSelect: () => void;
  className?: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    className={cn(
      "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-muted",
      isSelected && "bg-muted",
      className,
    )}
    onClick={onSelect}
  >
    <CheckIcon className={cn("size-3 shrink-0", !isSelected && "invisible")} />
    <span className="truncate">{children}</span>
  </button>
);

/**
 * Picks an AI model from `GET /api/ai/models`, one tab per provider. Used by
 * the chat and by the inline completions setting.
 *
 * Without `noneOption`, a missing choice, or one the server no longer lists,
 * is replaced with the first model listed. With it, such a choice goes back
 * to `null`, which the option stands for.
 */
const ModelPicker = ({
  value,
  onChange,
  noneOption,
  id,
  side = "top",
  variant = "ghost",
  className,
}: {
  value: ChatModel | null;
  onChange: (model: ChatModel | null) => void;
  /** Offered above the models, as `null`: for example "Same as chat". */
  noneOption?: string;
  id?: string;
  side?: "top" | "bottom";
  variant?: "ghost" | "outline";
  className?: string;
}) => {
  const { data: providers, isPending, error } = useQuery(aiModelsQuery());
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<string | null>(null);

  useEffect(() => {
    if (!providers?.length) return;
    const isListed = providers.some(
      (provider) =>
        provider.id === value?.provider &&
        provider.models.some((model) => model.id === value.id),
    );
    if (isListed) return;
    if (noneOption) {
      if (value) onChange(null);
      return;
    }
    const first = providers.find((provider) => provider.models.length);
    if (first) onChange({ provider: first.id, id: first.models[0].id });
  }, [providers, value, onChange, noneOption]);

  const size = variant === "ghost" ? "xs" : "sm";

  if (isPending || error || !providers) {
    return (
      <Button
        id={id}
        variant={variant}
        size={size}
        disabled
        className={cn("text-muted-foreground", className)}
        title={error ? `Couldn't load the models: ${error.message}` : undefined}
      >
        {isPending && <LoaderCircleIcon className="animate-spin" />}
        {isPending ? "Loading models…" : "Models unavailable"}
      </Button>
    );
  }

  const choose = (model: ChatModel | null) => {
    onChange(model);
    setIsOpen(false);
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        // Open on the selected model's provider.
        if (open) setTab(value?.provider ?? providers[0]?.id ?? null);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant={variant}
            size={size}
            className={cn(
              "max-w-48",
              variant === "ghost" && "text-muted-foreground",
              className,
            )}
            title="Model"
          />
        }
      >
        {value && (
          <ProviderIcon
            provider={value.provider}
            className={size === "xs" ? "size-3.5" : "size-4"}
          />
        )}
        <span className="truncate">
          {value?.id ?? noneOption ?? "Choose a model"}
        </span>
        <ChevronDownIcon />
      </PopoverTrigger>

      <PopoverContent align="start" side={side} className="w-64 gap-0 p-0">
        {noneOption && (
          <div className="border-b p-1">
            <OptionRow isSelected={!value} onSelect={() => choose(null)}>
              {noneOption}
            </OptionRow>
          </div>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="m-1 w-[calc(100%-0.5rem)]">
            {providers.map((provider) => (
              <TabsTrigger
                key={provider.id}
                value={provider.id}
                aria-label={provider.name}
                title={provider.name}
              >
                <ProviderIcon provider={provider.id} />
              </TabsTrigger>
            ))}
          </TabsList>

          {providers.map((provider) => (
            <TabsContent
              key={provider.id}
              value={provider.id}
              className="max-h-72 overflow-y-auto border-t p-1"
            >
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {provider.name}
              </p>
              {provider.models.map((model) => (
                <OptionRow
                  key={model.id}
                  className="font-mono"
                  isSelected={
                    value?.provider === provider.id && value.id === model.id
                  }
                  onSelect={() =>
                    choose({ provider: provider.id, id: model.id })
                  }
                >
                  {model.id}
                </OptionRow>
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
};

export default ModelPicker;
