import { useForm } from "@tanstack/react-form";
import { router, useLocalSearchParams } from "expo-router";
import { Button, FieldError, Input, type InputRef, Label, Spinner, TextField } from "heroui-native";
import { useRef, useState } from "react";
import { Text } from "react-native";

import { AuthScreen } from "@/components/auth-screen";
import { authClient } from "@/lib/auth-client";
import { firstIssue } from "@/lib/form-errors";
import { newPasswordSchema } from "@/lib/password";

/** Opened from the reset email's link, which carries the token (or an error if it's spent). */
export default function ResetPassword() {
  const { token, error } = useLocalSearchParams<{
    token?: string;
    error?: string;
  }>();
  const confirmInputRef = useRef<InputRef>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { password: "", confirmPassword: "" },
    validators: { onSubmit: newPasswordSchema },
    onSubmit: async ({ value }) => {
      setRefusal(null);
      const result = await authClient.resetPassword({
        newPassword: value.password,
        token,
      });
      if (result.error) {
        setRefusal(
          result.error.code === "INVALID_TOKEN"
            ? "This link has expired or was already used. Ask for a new one."
            : result.error.message || "Couldn't change the password. Try again.",
        );
        return;
      }
      router.replace({
        pathname: "/sign-in",
        params: { notice: "password-reset" },
      });
    },
  });

  if (!token || error) {
    return (
      <AuthScreen title="Link expired">
        <Text className="font-sans text-base text-foreground">
          This reset link has expired or was already used. Ask for a new one.
        </Text>
        <Button onPress={() => router.replace("/forgot-password")}>
          <Button.Label>Send a new link</Button.Label>
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="New password">
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
              <FieldError isInvalid={!!message}>{message}</FieldError>
              <form.Field name="password">
                {(field) => (
                  <TextField>
                    <Label>New password</Label>
                    <Input
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      placeholder="At least 8 characters"
                      secureTextEntry
                      autoComplete="new-password"
                      textContentType="newPassword"
                      returnKeyType="next"
                      submitBehavior="submit"
                      onSubmitEditing={() => confirmInputRef.current?.focus()}
                    />
                  </TextField>
                )}
              </form.Field>
              <form.Field name="confirmPassword">
                {(field) => (
                  <TextField>
                    <Label>Confirm new password</Label>
                    <Input
                      ref={confirmInputRef}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      secureTextEntry
                      autoComplete="new-password"
                      textContentType="newPassword"
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
                  <Button.Label>Change password</Button.Label>
                )}
              </Button>
            </>
          );
        }}
      </form.Subscribe>
    </AuthScreen>
  );
}
