import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Redirect, router } from "expo-router";
import { Button, Chip, FieldError, Input, Label, Spinner, TextField } from "heroui-native";
import { type PropsWithChildren, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import z from "zod";

import { firstIssue, refusalMessage } from "@/lib/form-errors";
import { useStaffMember } from "@/lib/staff-member";

type Role = "owner" | "staff";
type StaffList = FunctionReturnType<typeof api.backOffice.staff.list>;

const roleLabel = { owner: "Owner", staff: "Staff" } as const;

/** More → Staff: Owners invite people, change roles, and deactivate or reactivate Staff. */
export default function StaffScreen() {
  const insets = useSafeAreaInsets();
  const me = useStaffMember();
  const isOwner = me?.role === "owner";
  const list = useQuery(api.backOffice.staff.list, isOwner ? {} : "skip");

  // The server refuses non-Owners too; this keeps them off the screen.
  if (me && !isOwner) return <Redirect href="/more" />;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow"
      keyboardShouldPersistTaps="handled"
    >
      <View className="bg-brand-purple-deep px-4 pb-5" style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to More"
          className="-ml-2 size-11 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
        <Text className="mt-1 font-display text-[28px] text-white leading-tight">Staff</Text>
      </View>

      <View className="gap-4 p-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <InviteCard />
        {list === undefined ? (
          <Spinner />
        ) : (
          <>
            <Section title="Team">
              {list.staff.map((member) => (
                <StaffRow key={member._id} member={member} />
              ))}
            </Section>
            {list.invitations.length > 0 ? (
              <Section title="Invited">
                {list.invitations.map((invitation) => (
                  <InvitationRow key={invitation._id} invitation={invitation} />
                ))}
              </Section>
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View className="rounded-2xl border border-border bg-surface">
      <Text className="px-4 pt-4 font-sans-semibold text-muted text-xs uppercase tracking-[2px]">
        {title}
      </Text>
      {children}
    </View>
  );
}

function RoleToggle({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <View className="flex-row gap-2" accessibilityRole="radiogroup">
      {(["staff", "owner"] as const).map((role) => (
        <Button
          key={role}
          className="flex-1"
          variant={value === role ? "primary" : "secondary"}
          onPress={() => onChange(role)}
          accessibilityRole="radio"
          aria-checked={value === role}
        >
          <Button.Label>{roleLabel[role]}</Button.Label>
        </Button>
      ))}
    </View>
  );
}

const inviteSchema = z.object({
  email: z.string().trim().min(1, "Enter their email").email("Enter a valid email address"),
  role: z.enum(["owner", "staff"]),
});

function InviteCard() {
  const invite = useMutation(api.backOffice.staff.invite);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "", role: "staff" as Role },
    validators: { onSubmit: inviteSchema },
    onSubmit: async ({ value, formApi }) => {
      setRefusal(null);
      setSentTo(null);
      const email = value.email.trim();
      try {
        await invite({ email, role: value.role });
      } catch (error) {
        setRefusal(refusalMessage(error, "Couldn't send the invitation. Try again."));
        return;
      }
      setSentTo(email);
      formApi.reset();
    },
  });

  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
      <Text className="font-sans-semibold text-base text-foreground">Invite someone</Text>
      <Text className="font-sans text-muted text-sm">
        They get an email link to set their own password. It works for 7 days.
      </Text>
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
              {sentTo && !message ? (
                <Text className="font-sans-medium text-brand-success text-sm">
                  Invitation sent to {sentTo}.
                </Text>
              ) : null}
              <form.Field name="email">
                {(field) => (
                  <TextField>
                    <Label>Email</Label>
                    <Input
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      placeholder="name@emblish.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="off"
                    />
                  </TextField>
                )}
              </form.Field>
              <form.Field name="role">
                {(field) => <RoleToggle value={field.state.value} onChange={field.handleChange} />}
              </form.Field>
              <Button onPress={form.handleSubmit} isDisabled={isSubmitting}>
                {isSubmitting ? (
                  <Spinner size="sm" color="default" />
                ) : (
                  <Button.Label>Send invitation</Button.Label>
                )}
              </Button>
            </>
          );
        }}
      </form.Subscribe>
    </View>
  );
}

/** Runs an Owner action, explaining a refusal (such as the last Owner rule) in an alert. */
async function attempt(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    Alert.alert("Couldn't do that", refusalMessage(error));
  }
}

function StaffRow({ member }: { member: StaffList["staff"][number] }) {
  const setRole = useMutation(api.backOffice.staff.setRole);
  const deactivate = useMutation(api.backOffice.staff.deactivate);
  const reactivate = useMutation(api.backOffice.staff.reactivate);
  const active = member.status === "active";
  const otherRole: Role = member.role === "owner" ? "staff" : "owner";
  const staffId: Id<"staff"> = member._id;

  const confirmDeactivate = () =>
    Alert.alert(
      `Deactivate ${member.name}?`,
      "They're signed out now and can't sign in until an Owner reactivates them. Their name stays on everything they did.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: () => attempt(() => deactivate({ staffId })),
        },
      ],
    );

  return (
    <View className="gap-3 border-border border-t p-4 first:border-t-0">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-sans-semibold text-base text-foreground">
            {member.name}
            {member.isYou ? <Text className="font-sans text-muted"> (you)</Text> : null}
          </Text>
          <Text className="font-sans text-muted text-sm">{member.email}</Text>
        </View>
        <View className="flex-row gap-1.5">
          <Chip size="sm" variant="soft" color={member.role === "owner" ? "accent" : "default"}>
            <Chip.Label>{roleLabel[member.role]}</Chip.Label>
          </Chip>
          {active ? null : (
            <Chip size="sm" variant="soft" color="danger">
              <Chip.Label>Deactivated</Chip.Label>
            </Chip>
          )}
        </View>
      </View>
      {/* Owners may step down or deactivate themselves; the server keeps one active Owner. */}
      <View className="flex-row gap-2">
        {active ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onPress={() => attempt(() => setRole({ staffId, role: otherRole }))}
            >
              <Button.Label>Make {roleLabel[otherRole]}</Button.Label>
            </Button>
            <Button size="sm" variant="danger-soft" className="flex-1" onPress={confirmDeactivate}>
              <Button.Label>Deactivate</Button.Label>
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onPress={() => attempt(() => reactivate({ staffId }))}
          >
            <Button.Label>Reactivate</Button.Label>
          </Button>
        )}
      </View>
    </View>
  );
}

function InvitationRow({ invitation }: { invitation: StaffList["invitations"][number] }) {
  const cancel = useMutation(api.backOffice.staff.cancelInvitation);
  const expired = invitation.expiresAt <= Date.now();
  const expiry = new Date(invitation.expiresAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  return (
    <View className="flex-row items-center gap-3 border-border border-t p-4 first:border-t-0">
      <View className="flex-1">
        <Text className="font-sans-semibold text-base text-foreground">{invitation.email}</Text>
        <Text
          className="font-sans text-sm"
          style={{ color: expired ? brand.danger : brand["ink-muted"] }}
        >
          {roleLabel[invitation.role]} ·{" "}
          {expired ? "Link expired, invite again" : `Link works until ${expiry}`}
        </Text>
      </View>
      <Button
        size="sm"
        variant="ghost"
        onPress={() => attempt(() => cancel({ invitationId: invitation._id }))}
      >
        <Button.Label>Cancel</Button.Label>
      </Button>
    </View>
  );
}
