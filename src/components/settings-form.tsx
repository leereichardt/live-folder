import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import * as React from "react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { sendMessage } from "webext-bridge/popup";
import { PrNamePreview } from "./pr-name-preview";
import { Loader2 } from "lucide-react";

const TAB_GROUP_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
] as const;

const PR_FILTER_OPTIONS = [
  { value: "both", label: "Assigned to me & Review requested" },
  { value: "assigned", label: "Assigned to me only" },
  { value: "review-requested", label: "Review requested only" },
] as const;

const settingsSchema = z.object({
  name: z
    .string({
      required_error: "Name is required",
    })
    .trim()
    .min(1, { message: "Name is required" })
    .max(200, { message: "Name is too long" }),
  prNameFormat: z
    .string({
      required_error: "Name format is required",
    })
    .trim()
    .min(1, { message: "Name format is required" })
    .max(200, { message: "Name format is too long" }),
  refreshInterval: z.coerce
    .number({
      required_error: "Refresh interval is required",
    })
    .int({
      message: "Refresh interval must a whole number",
    })
    .positive({
      message: "Refresh interval must be positive",
    })
    .min(1, { message: "Refresh interval is required" }),
  tabGroupColor: z.enum(TAB_GROUP_COLORS).optional(),
  prFilter: z.enum(["assigned", "review-requested", "both"]),
  organizationFilter: z.string().optional(),
});

type SettingsSchema = z.infer<typeof settingsSchema>;

const isChrome = import.meta.env.BROWSER === "chrome";

export function SettingsForm({
  defaultValues,
}: {
  defaultValues: SettingsSchema | null;
}) {
  const [pending, startTransition] = React.useTransition();
  const form = useForm<SettingsSchema>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaultValues ?? {},
    reValidateMode: "onChange",
    mode: "onChange",
  });

  function onSubmit(data: SettingsSchema) {
    startTransition(async () => {
      try {
        await sendMessage(
          "SET_CONFIG",
          {
            name: data.name,
            prNameFormat: data.prNameFormat,
            refreshInterval: data.refreshInterval,
            prFilter: data.prFilter,
            organizationFilter: data.organizationFilter || "",
            ...(isChrome &&
              data.tabGroupColor && { tabGroupColor: data.tabGroupColor }),
          },
          "background",
        );
        form.reset(data);
      } catch (error) {
        console.error("Error sending message:", error);
      }
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-y-2"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {isChrome ? "Tab Group Name" : "Folder Name"}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="Pull Requests"
                  disabled={pending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {isChrome && (
          <FormField
            control={form.control}
            name="tabGroupColor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tab Group Color</FormLabel>
                <FormControl>
                  <div className="flex gap-2">
                    {TAB_GROUP_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        disabled={pending}
                        onClick={() => field.onChange(color)}
                        className={`h-8 w-8 rounded-md border-2 transition-all ${
                          field.value === color
                            ? "scale-110 border-primary"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{
                          backgroundColor:
                            color === "grey"
                              ? "#5f6368"
                              : color === "cyan"
                                ? "#06b6d4"
                                : color,
                        }}
                        title={color}
                      />
                    ))}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="prFilter"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pull Requests to Track</FormLabel>
              <FormControl>
                <select
                  {...field}
                  disabled={pending}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {PR_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="organizationFilter"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organizations (optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., myorg, company"
                  disabled={pending}
                  {...field}
                />
              </FormControl>
              <FormDescription className="text-xs leading-tight">
                Leave empty to show all organizations, or enter comma-separated
                organization names to filter.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="refreshInterval"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Refresh Interval</FormLabel>
              <FormControl>
                <Input
                  disabled={pending}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Refresh interval of pull requests in minutes.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="prNameFormat"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pull Request Name Format</FormLabel>
              <FormControl>
                <Input
                  placeholder="[%repository%] %name%"
                  disabled={pending}
                  {...field}
                />
              </FormControl>
              <FormDescription className="text-xs leading-tight">
                You can alter the format by using placeholders: %repository%,
                %name%, %number%.
              </FormDescription>
              <div className="text-[0.8rem] text-xs text-muted-foreground">
                The pull request name will have the following format:
                <PrNamePreview prName={field.value} />
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          className="mt-2 w-full font-bold text-accent-foreground"
          type="submit"
          size="sm"
          disabled={pending || !form.formState.isDirty}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </form>
    </Form>
  );
}
