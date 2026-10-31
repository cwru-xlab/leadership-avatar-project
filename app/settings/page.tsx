"use client";

import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Switch } from "@heroui/switch";
import { Divider } from "@heroui/divider";
import { Chip } from "@heroui/chip";
import { addToast } from "@heroui/toast";
import { User, Mail, Bell, LogOut, GraduationCap } from "lucide-react";

import { title } from "@/components/primitives";
import { useAuth } from "@/lib/auth-context";

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  studentId: string;
}

interface NotificationSettings {
  emailNotifications: boolean;
  caseReminders: boolean;
  dueDateAlerts: boolean;
}

interface CoachView {
  name: string;
  avatarId: string;
  voiceId: string;
  isDefault: boolean;
}

interface RosterOption {
  avatarId: string;
  name: string;
  previewUrl: string | null;
  voice: { id: string; name: string };
}

function CoachCard() {
  const [coach, setCoach] = useState<CoachView | null>(null);
  const [roster, setRoster] = useState<RosterOption[]>([]);
  const [selected, setSelected] = useState<RosterOption | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/settings/coach")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setCoach(d.coach))
      .catch(() => {});
    fetch("/api/interview/interviewers")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setRoster(d.interviewers ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const preview = roster.find((o) => o.avatarId === coach?.avatarId)?.previewUrl;
  const visible = roster.filter((o) =>
    o.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const send = async (method: "PUT" | "DELETE") => {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/coach", {
        method,
        headers: { "Content-Type": "application/json" },
        body:
          method === "PUT" && selected
            ? JSON.stringify({
                avatarId: selected.avatarId,
                voiceId: selected.voice.id,
                name: selected.name,
              })
            : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast({
          title: data.error ?? "Could not update your coach",
          color: "danger",
        });
        return;
      }
      setCoach(data.coach);
      setSelected(null);
      addToast({
        title: method === "PUT" ? "Coach saved" : "Using the default coach",
        color: "success",
      });
    } catch {
      addToast({ title: "Could not update your coach", color: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card shadow="none" className="border border-line">
      <CardHeader className="flex gap-3">
        <GraduationCap className="text-primary" size={20} />
        <h2 className="font-display text-xl font-medium text-cwru-blue">Your coach</h2>
      </CardHeader>
      <CardBody className="gap-4">
        <p className="text-xs text-muted">
          Your coach appears only in coached sessions on your study-plan path.
        </p>
        {coach && (
          <div className="flex items-center gap-3">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={coach.name}
                className="w-14 h-14 rounded-full object-cover"
                src={preview}
              />
            )}
            <p className="font-medium">{coach.name}</p>
            {coach.isDefault && (
              <Chip size="sm" variant="flat">
                Default
              </Chip>
            )}
          </div>
        )}
        <Divider />
        <Input
variant="bordered"
          label="Search coaches"
          size="sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-72 overflow-y-auto">
          {visible.map((o) => (
            <button
              key={o.avatarId}
              className={`flex flex-col items-center gap-1 rounded-lg p-2 border text-xs ${
                selected?.avatarId === o.avatarId
                  ? "border-primary bg-primary/10"
                  : "border-default-200"
              }`}
              type="button"
              onClick={() => setSelected(o)}
            >
              {o.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={o.name}
                  className="w-16 h-16 rounded-full object-cover"
                  src={o.previewUrl}
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-default-100" />
              )}
              <span className="text-center">{o.name}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            isDisabled={busy || !coach || coach.isDefault}
            variant="flat"
            onPress={() => send("DELETE")}
          >
            Use the default
          </Button>
          <Button
            color="primary"
            isDisabled={!selected}
            isLoading={busy}
            onPress={() => send("PUT")}
          >
            Save coach
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export default function StudentSettingsPage() {
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState<UserProfile>({
    firstName: "",
    lastName: "",
    email: "",
    studentId: "",
  });

  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailNotifications: true,
    caseReminders: true,
    dueDateAlerts: false,
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      const nameParts = user.name.split(" ");
      setProfile({
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" ") || "",
        email: user.email,
        studentId: user.studentId || "",
      });
    }
  }, [user]);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
    }, 500);
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className={title()}>Settings</h1>
        <p className="text-muted">
          Manage your profile and preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card shadow="none" className="border border-line">
            <CardHeader className="flex gap-3">
              <User className="text-primary" size={20} />
              <h2 className="font-display text-xl font-medium text-cwru-blue">Profile information</h2>
            </CardHeader>
            <CardBody className="gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
variant="bordered"
                  label="First Name"
                  value={profile.firstName}
                  onChange={(e) =>
                    setProfile({ ...profile, firstName: e.target.value })
                  }
                />
                <Input
variant="bordered"
                  label="Last Name"
                  value={profile.lastName}
                  onChange={(e) =>
                    setProfile({ ...profile, lastName: e.target.value })
                  }
                />
              </div>
              <Input
variant="bordered"
                label="Email"
                startContent={<Mail className="text-muted" size={16} />}
                type="email"
                value={profile.email}
                onChange={(e) =>
                  setProfile({ ...profile, email: e.target.value })
                }
              />
              <Input
variant="bordered"
                isReadOnly
                description="Student ID cannot be changed"
                label="Student ID"
                value={profile.studentId}
              />
              <div className="flex justify-end">
                <Button
                  color="primary"
                  isLoading={isSaving}
                  onPress={handleSave}
                >
                  Save Changes
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card shadow="none" className="border border-line">
            <CardHeader className="flex gap-3">
              <Bell className="text-primary" size={20} />
              <h2 className="font-display text-xl font-medium text-cwru-blue">Notifications</h2>
            </CardHeader>
            <CardBody className="gap-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">Email Notifications</p>
                  <p className="text-xs text-muted">
                    Receive updates via email
                  </p>
                </div>
                <Switch
                  isSelected={notifications.emailNotifications}
                  onValueChange={(value) =>
                    setNotifications({ ...notifications, emailNotifications: value })
                  }
                />
              </div>
              <Divider />
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">Case Reminders</p>
                  <p className="text-xs text-muted">
                    Get reminded about assigned cases
                  </p>
                </div>
                <Switch
                  isSelected={notifications.caseReminders}
                  onValueChange={(value) =>
                    setNotifications({ ...notifications, caseReminders: value })
                  }
                />
              </div>
              <Divider />
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">Due Date Alerts</p>
                  <p className="text-xs text-muted">
                    Notify before case deadlines
                  </p>
                </div>
                <Switch
                  isSelected={notifications.dueDateAlerts}
                  onValueChange={(value) =>
                    setNotifications({ ...notifications, dueDateAlerts: value })
                  }
                />
              </div>
            </CardBody>
          </Card>

          <CoachCard />
        </div>

        <div className="flex flex-col gap-6">
          <Card shadow="none" className="border border-line">
            <CardBody className="items-center text-center py-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <span className="font-display text-2xl font-medium text-cwru-blue">
                  {profile.firstName[0]}
                  {profile.lastName[0]}
                </span>
              </div>
              <p className="font-semibold">
                {profile.firstName} {profile.lastName}
              </p>
              <p className="text-sm text-muted">{profile.email}</p>
              <p className="mt-1 text-xs text-muted tabular-nums">
                {profile.studentId}
              </p>
            </CardBody>
          </Card>

          <Card shadow="none" className="border border-line">
            <CardBody>
              <Button
                fullWidth
                className="h-11 rounded-lg border-copper/50 font-semibold text-copper"
                startContent={<LogOut size={18} />}
                variant="bordered"
                onPress={handleLogout}
              >
                Sign out
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
