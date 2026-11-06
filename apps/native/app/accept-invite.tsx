import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { useForm } from "@tanstack/react-form";
import { useAction, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { Button, FieldError, Input, type InputRef, Label, Spinner, TextField } from "heroui-native";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import z from "zod";

import { AuthScreen } from "@/components/auth-screen";
import { authClient } from "@/lib/auth-client";
import { firstIssue, refusalMessage } from "@/lib/form-errors";
import { newPasswordSchema } from "@/lib/password";

const roleLabel = { owner: "Owner", staff: "Staff" } as const;

const closed = {
  expired: "This invitation has expired. Ask an Owner to invite you again.",
  used: "This invitation has already been used. Sign in instead.",
  cancelled: "This invitation was cancelled. Ask an Owner to invite you again.",
  unknown: "This invitation link isn't valid. Check you opened the latest email.",
} as const;

const schema = newPasswordSchema.and(
  z.object({ name: z.string().trim().min(1, "Enter your name") }),
);

/** Opened from an invitation email: the invitee sets their name and password, then is signed in. */
export default function AcceptInvite() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const invitation = useQuery(api.backOffice.invitation.lookup, token ? { token } : "skip");

  if (!token || invitation?.status === "unknown") return <Closed message={closed.unknown} />;
  if (invitation === undefined) {
    return (
      <AuthScreen title="Join the team">
        <Spinner />
      </AuthScreen>
    );
  }
  if (invitation.status !== "open") return <Closed message={closed[invitation.status]} />;

  return <SetUpAccount token={token} email={invitation.email} role={invitation.role} />;
}

function Closed({ message }: { message: string }) {
  return (
    <AuthScreen title="Invitation closed">
      <Text className="font-sans text-base text-foreground">{message}</Text>
      <Button variant="secondary" onPress={() => router.replace("/sign-in")}>
        <Button.Label>Go to sign in</Button.Label>
      </Button>
    </AuthScreen>
  );
}

function SetUpAccount({
  token,
  email,
  role,
}: {
  token: string;
  email: string;
  role: keyof typeof roleLabel;
}) {
  const accept = useAction(api.backOffice.invitation.accept);
  const passwordInputRef = useRef<InputRef>(null);
  const confirmInputRef = useRef<InputRef>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", password: "", confirmPassword: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setRefusal(null);
      try {
        await accept({
          token,
          name: value.name.trim(),
          password: value.password,
        });
      } catch (error) {
        setRefusal(refusalMessage(error, "Couldn't set up your account. Try again."));
        return;
      }
      // Signing in flips the root guard over to the tabs.
      const { error } = await authClient.signIn.email({
        email,
        password: value.password,
      });
      if (error) {
        router.replace("/sign-in");
      }
    },
  });

  return (
    <AuthScreen title="Join the team">
      <View className="rounded-2xl border border-border bg-surface p-4">
        <Text className="font-sans text-muted text-sm">
          You're invited to the Back Office as {roleLabel[role]}.
        </Text>
        <Text className="mt-1 font-sans-semibold text-base text-foreground">{email}</Text>
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
            <>
              <FieldError isInvalid={!!message}>{message}</FieldError>
              <form.Field name="name">
                {(field) => (
                  <TextField>
                    <Label>Your name</Label>
                    <Input
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      placeholder="As your team knows you"
                      autoComplete="name"
                      textContentType="name"
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
                    <Label>Confirm password</Label>
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
                  <Button.Label>Set up my account</Button.Label>
                )}
              </Button>
            </>
          );
        }}
      </form.Subscribe>
    </AuthScreen>
  );
}
