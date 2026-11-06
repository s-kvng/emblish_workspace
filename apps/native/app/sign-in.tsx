import { useForm } from "@tanstack/react-form";
import { Link, useLocalSearchParams } from "expo-router";
import { Button, FieldError, Input, type InputRef, Label, Spinner, TextField } from "heroui-native";
import { useRef, useState } from "react";
import { Text } from "react-native";
import z from "zod";

import { AuthScreen } from "@/components/auth-screen";
import { authClient } from "@/lib/auth-client";
import { firstIssue } from "@/lib/form-errors";

const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

const notices = {
  "password-reset": "Your password is changed. Sign in with the new one.",
} as const;

/** Staff sign in with the email and password they set up from their invitation; there is no sign-up. */
export default function SignIn() {
  const { notice } = useLocalSearchParams<{ notice?: keyof typeof notices }>();
  const passwordInputRef = useRef<InputRef>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: signInSchema },
    onSubmit: async ({ value }) => {
      setRefusal(null);
      // On success the session flips the root guard over to the tabs.
      const { error } = await authClient.signIn.email({
        email: value.email.trim(),
        password: value.password,
      });
      if (error) {
        setRefusal(
          error.status === 401
            ? "That email and password don't match."
            : error.message || "Couldn't sign in. Try again.",
        );
      }
    },
  });

  return (
    <AuthScreen title="Sign in">
      <form.Subscribe
        selector={(state) => ({
          isSubmitting: state.isSubmitting,
          validationError: firstIssue(state.errorMap.onSubmit),
        })}
      >
        {({ isSubmitting, validationError }) => {
          const message = validationError ?? refusal;

          return (
            <>
              {notice && notices[notice] && !message ? (
                <Text className="font-sans-medium text-brand-success text-sm">
                  {notices[notice]}
                </Text>
              ) : null}
              <FieldError isInvalid={!!message}>{message}</FieldError>

              <form.Field name="email">
                {(field) => (
                  <TextField>
                    <Label>Email</Label>
                    <Input
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      placeholder="you@emblish.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      textContentType="username"
                      returnKeyType="next"
                      submitBehavior="submit"
                      onSubmitEditing={() => passwordInputRef.current?.focus()}
                    />
                  </TextField>
                )}
              </form.Field>

              <form.Field name="password">
                {(field) => (
                  <TextField>
                    <Label>Password</Label>
                    <Input
                      ref={passwordInputRef}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      placeholder="••••••••"
                      secureTextEntry
                      autoComplete="current-password"
                      textContentType="password"
                      returnKeyType="go"
                      onSubmitEditing={form.handleSubmit}
                    />
                  </TextField>
                )}
              </form.Field>

              <Button onPress={form.handleSubmit} isDisabled={isSubmitting} className="mt-2">
                {isSubmitting ? (
                  <Spinner size="sm" color="default" />
                ) : (
                  <Button.Label>Sign in</Button.Label>
                )}
              </Button>

              <Link href="/forgot-password" asChild>
                <Button variant="ghost">
                  <Button.Label>Forgot password?</Button.Label>
                </Button>
              </Link>

              <Text className="text-center font-sans text-muted text-xs">
                New Staff are invited by an Owner.
              </Text>
            </>
          );
        }}
      </form.Subscribe>
    </AuthScreen>
  );
}
