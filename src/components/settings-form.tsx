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
});

type SettingsSchema = z.infer<typeof settingsSchema>;

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
        onSubmit={void form.handleSubmit(onSubmit)}
        className="flex flex-col gap-y-2"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Folder Name</FormLabel>
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
