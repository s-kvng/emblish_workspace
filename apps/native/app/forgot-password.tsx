import { useForm } from "@tanstack/react-form";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { Button, FieldError, Input, Label, Spinner, TextField } from "heroui-native";
import { useState } from "react";
import { Text } from "react-native";
import z from "zod";

import { AuthScreen } from "@/components/auth-screen";
import { authClient } from "@/lib/auth-client";
import { firstIssue } from "@/lib/form-errors";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address"),
});

/** Staff ask for a reset link by email; it opens the reset screen in this app. */
export default function ForgotPassword() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setRefusal(null);
      const email = value.email.trim();
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: Linking.createURL("/reset-password"),
      });
      if (error) setRefusal(error.message || "Couldn't send the link. Try again.");
      else setSentTo(email);
    },
  });

  if (sentTo) {
    return (
      <AuthScreen title="Check your email">
        <Text className="font-sans text-base text-foreground">
          If {sentTo} belongs to Staff, we've emailed it a link to set a new password. The link
          expires in 1 hour.
        </Text>
        <Button variant="secondary" onPress={() => router.replace("/sign-in")}>
          <Button.Label>Back to sign in</Button.Label>
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Reset password">
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
              <Text className="font-sans text-muted text-sm">
                Enter the email you sign in with and we'll send you a link to set a new password.
              </Text>
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
                      returnKeyType="send"
                      onSubmitEditing={form.handleSubmit}
                    />
                  </TextField>
                )}
              </form.Field>
              <Button onPress={form.handleSubmit} isDisabled={isSubmitting} className="mt-2">
                {isSubmitting ? (
                  <Spinner size="sm" color="default" />
                ) : (
                  <Button.Label>Send reset link</Button.Label>
                )}
              </Button>
              <Button variant="ghost" onPress={() => router.replace("/sign-in")}>
                <Button.Label>Back to sign in</Button.Label>
              </Button>
            </>
          );
        }}
      </form.Subscribe>
    </AuthScreen>
  );
}
