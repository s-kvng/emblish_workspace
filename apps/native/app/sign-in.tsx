import { useForm } from "@tanstack/react-form";
import { Button, FieldError, Input, type InputRef, Label, Spinner, TextField } from "heroui-native";
import { useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import z from "zod";

import { authClient } from "@/lib/auth-client";

const emblem = require("@/assets/images/emblem.png");

const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

function firstIssue(error: unknown): string | null {
  if (Array.isArray(error)) return firstIssue(error[0]);
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return null;
}

/** Staff sign in with the email and password their Owner set up; there is no sign-up. */
export default function SignIn() {
  const insets = useSafeAreaInsets();
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
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow"
      keyboardShouldPersistTaps="handled"
    >
      <View className="bg-brand-purple-deep px-4 pb-8" style={{ paddingTop: insets.top + 32 }}>
        <Image source={emblem} className="size-10" accessibilityIgnoresInvertColors />
        <Text className="mt-4 font-sans-semibold text-brand-gold-bright text-xs uppercase tracking-[2px]">
          Back Office
        </Text>
        <Text className="mt-1 font-display text-[32px] text-white leading-tight">Sign in</Text>
      </View>

      <form.Subscribe
        selector={(state) => ({
          isSubmitting: state.isSubmitting,
          validationError: firstIssue(state.errorMap.onSubmit),
        })}
      >
        {({ isSubmitting, validationError }) => {
          const message = validationError ?? refusal;

          return (
            <View className="gap-4 p-4">
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

              <Text className="text-center font-sans text-muted text-xs">
                New Staff are invited by an Owner.
              </Text>
            </View>
          );
        }}
      </form.Subscribe>
    </KeyboardAwareScrollView>
  );
}
