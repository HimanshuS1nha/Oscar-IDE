import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LoaderCircleIcon } from "lucide-react";

import { registerValidator } from "@oscar/validators";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { useRegister } from "@/hooks/use-auth";

export const Route = createFileRoute("/_auth/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const { mutateAsync: register, isPending } = useRegister();

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    validators: { onBlur: registerValidator, onSubmit: registerValidator },
    // Errors are shown by the mutation's toast; swallow the rejection.
    onSubmit: ({ value }) => register(value).catch(() => {}),
  });

  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Create an Oscar account</h1>
        <p className="text-sm text-muted-foreground">
          Sync your settings across machines and use AI features.
        </p>
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup className="gap-4">
          <form.Field name="name">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    autoComplete="name"
                    autoFocus
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="email">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="password">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    autoComplete="new-password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid ? (
                    <FieldError errors={field.state.meta.errors} />
                  ) : (
                    <FieldDescription>At least 8 characters.</FieldDescription>
                  )}
                </Field>
              );
            }}
          </form.Field>

          <Field>
            <Button type="submit" disabled={isPending}>
              {isPending && <LoaderCircleIcon className="animate-spin" />}
              Create account
            </Button>
            <FieldDescription className="text-center">
              Already have an account? <Link to="/sign-in">Sign in</Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </>
  );
}
