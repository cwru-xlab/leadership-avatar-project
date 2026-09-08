"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Select, SelectItem } from "@heroui/select";
import { ArrowLeft, Plus, Save, Trash2, X, Upload, ImageIcon, Sparkles } from "lucide-react";
import { addToast } from "@heroui/toast";
import { title as pageTitle } from "@/components/primitives";
import { useAuth } from "@/lib/auth-context";
import { caseStorage } from "@/lib/case-storage";
import Image from "next/image";
import type { CaseStudy, CaseAvatar, VideoAudioProfile, PracticeTopic } from "@/types";
import {
  PRACTICE_TOPICS,
  TOPIC_META,
  TOPIC_SUBTYPES,
  DEFAULT_TOPIC_SKILLS,
} from "@/lib/topics";

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const caseId = params.caseId as string;
  const isNewCase = caseId === "new";

  const [name, setName] = useState("");
  const [backgroundInfo, setBackgroundInfo] = useState("");
  const [evaluationPrompt, setEvaluationPrompt] = useState("");
  const [avatars, setAvatars] = useState<CaseAvatar[]>([]);
  const [coverImage, setCoverImage] = useState<string | undefined>(undefined);
  const [topic, setTopic] = useState<PracticeTopic>("interview");
  const [subtype, setSubtype] = useState("");
  const [personaRole, setPersonaRole] = useState("interviewer");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [profiles, setProfiles] = useState<VideoAudioProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const [originalValues, setOriginalValues] = useState<{
    name: string;
    backgroundInfo: string;
    evaluationPrompt: string;
    avatars: string;
    coverImage: string | undefined;
    topic: PracticeTopic;
    subtype: string;
    personaRole: string;
    difficulty: "beginner" | "intermediate" | "advanced";
  }>({
    name: "",
    backgroundInfo: "",
    evaluationPrompt: "",
    avatars: "[]",
    coverImage: undefined,
    topic: "interview",
    subtype: "",
    personaRole: "interviewer",
    difficulty: "intermediate",
  });

  const generatedId = useMemo(() => {
    if (!isNewCase) return caseId;
    if (!name.trim()) return "";
    return name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }, [name, isNewCase, caseId]);

  const hasUnsavedChanges = useMemo(() => {
    return (
      name !== originalValues.name ||
      backgroundInfo !== originalValues.backgroundInfo ||
      evaluationPrompt !== originalValues.evaluationPrompt ||
      JSON.stringify(avatars) !== originalValues.avatars ||
      coverImage !== originalValues.coverImage ||
      topic !== originalValues.topic ||
      subtype !== originalValues.subtype ||
      personaRole !== originalValues.personaRole ||
      difficulty !== originalValues.difficulty
    );
  }, [
    name,
    backgroundInfo,
    evaluationPrompt,
    avatars,
    coverImage,
    topic,
    subtype,
    personaRole,
    difficulty,
    originalValues,
  ]);

  useEffect(() => {
    const loadCase = async () => {
      if (!isNewCase) {
        setIsLoading(true);
        try {
          const caseData = await caseStorage.get(caseId);
          if (caseData) {
            const loadedTopic = (caseData.topic || "interview") as PracticeTopic;
            setName(caseData.name);
            setBackgroundInfo(caseData.backgroundInfo);
            setEvaluationPrompt(caseData.evaluationPrompt || "");
            setAvatars(caseData.avatars);
            setCoverImage(caseData.coverImage);
            setTopic(loadedTopic);
            setSubtype(caseData.subtype || "");
            setPersonaRole(caseData.personaRole || "interviewer");
            setDifficulty(caseData.difficulty || "intermediate");
            setOriginalValues({
              name: caseData.name,
              backgroundInfo: caseData.backgroundInfo,
              evaluationPrompt: caseData.evaluationPrompt || "",
              avatars: JSON.stringify(caseData.avatars),
              coverImage: caseData.coverImage,
              topic: loadedTopic,
              subtype: caseData.subtype || "",
              personaRole: caseData.personaRole || "interviewer",
              difficulty: caseData.difficulty || "intermediate",
            });
          } else {
            setErrors({ load: "Scenario not found" });
          }
        } catch (error) {
          console.error("Failed to load scenario:", error);
          setErrors({ load: "Failed to load scenario" });
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadCase();
  }, [caseId, isNewCase]);

  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const res = await fetch("/api/profile/list");
        if (res.ok) {
          const data = await res.json();
          setProfiles(data.profiles || []);
        }
      } catch (error) {
        console.error("Failed to load profiles:", error);
      }
    };
    loadProfiles();
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Scenario name is required";
    } else if (generatedId === "new") {
      newErrors.name = "Scenario name cannot generate 'new' as ID";
    }

    if (!backgroundInfo.trim()) {
      newErrors.backgroundInfo = "Background information is required";
    }

    if (!evaluationPrompt.trim()) {
      newErrors.evaluationPrompt = "Evaluation prompt is required";
    }

    if (!topic) {
      newErrors.topic = "Topic is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const userName = user?.name || "Unknown User";
      const targetSkills = DEFAULT_TOPIC_SKILLS[topic];

      if (isNewCase) {
        await caseStorage.add({
          name,
          backgroundInfo,
          evaluationPrompt: evaluationPrompt || undefined,
          coverImage,
          avatars,
          cohortIds: [],
          createdBy: userName,
          lastEditedBy: userName,
          topic,
          subtype: subtype || undefined,
          personaRole: personaRole || undefined,
          difficulty,
          targetSkills,
        });

        addToast({
          title: "Scenario Created",
          description: "Your scenario has been created successfully.",
          color: "success",
        });
      } else {
        await caseStorage.update(caseId, {
          name,
          backgroundInfo,
          evaluationPrompt: evaluationPrompt || undefined,
          coverImage,
          avatars,
          lastEditedBy: userName,
          topic,
          subtype: subtype || undefined,
          personaRole: personaRole || undefined,
          difficulty,
          targetSkills,
        });

        addToast({
          title: "Scenario Updated",
          description: "Your changes have been saved successfully.",
          color: "success",
        });
      }

      router.push("/case-management");
    } catch (error) {
      console.error("Error saving scenario:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save scenario";
      setErrors({ save: errorMessage });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== name) {
      setErrors({
        delete: "Please type the exact case name to confirm deletion.",
      });
      return;
    }

    setIsDeleting(true);
    try {
      await caseStorage.delete(caseId);
      addToast({
        title: "Case Deleted",
        description: "The case study has been deleted.",
        color: "success",
      });
      router.push("/case-management");
    } catch (error) {
      console.error("Error deleting case:", error);
      setErrors({ delete: "Failed to delete case. Please try again." });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBack = () => {
    router.push("/case-management");
  };

  const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      addToast({
        title: "Invalid file type",
        description: "Please upload an image file (JPEG, PNG, etc.)",
        color: "danger",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      addToast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
        color: "danger",
      });
      return;
    }

    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("caseId", isNewCase ? generatedId : caseId);

      const response = await fetch("/api/case/upload-cover", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to upload image");
      }

      const data = await response.json();
      setCoverImage(data.url);
      addToast({
        title: "Cover image uploaded",
        description: "Your cover image has been uploaded successfully.",
        color: "success",
      });
    } catch (error) {
      console.error("Error uploading cover image:", error);
      addToast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload image",
        color: "danger",
      });
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) {
        coverInputRef.current.value = "";
      }
    }
  };

  const handleRemoveCoverImage = () => {
    setCoverImage(undefined);
  };

  const handleGenerateAICover = async () => {
    if (!name.trim() && !backgroundInfo.trim()) {
      addToast({
        title: "Missing information",
        description: "Please enter a case name or background info to generate an image",
        color: "warning",
      });
      return;
    }

    setGeneratingCover(true);
    try {
      const response = await fetch("/api/case/generate-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: isNewCase ? generatedId : caseId,
          name,
          backgroundInfo: backgroundInfo.substring(0, 500),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate image");
      }

      const data = await response.json();
      setCoverImage(data.url);
      addToast({
        title: "Cover image generated",
        description: "AI has created a cover image for your case study.",
        color: "success",
      });
    } catch (error) {
      console.error("Error generating cover image:", error);
      addToast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Failed to generate image",
        color: "danger",
      });
    } finally {
      setGeneratingCover(false);
    }
  };

  const handleAddAvatar = () => {
    const newAvatar: CaseAvatar = {
      id: `avatar-${Date.now()}`,
      name: "",
      role: "",
      additionalInfo: "",
    };
    setAvatars([...avatars, newAvatar]);
  };

  const handleRemoveAvatar = (avatarId: string) => {
    setAvatars(avatars.filter((a) => a.id !== avatarId));
  };

  const updateAvatar = (avatarId: string, updates: Partial<CaseAvatar>) => {
    setAvatars(
      avatars.map((a) => (a.id === avatarId ? { ...a, ...updates } : a))
    );
  };

  if (isLoading && !isNewCase) {
    return (
      <div className="flex flex-col gap-6 max-w-6xl mx-auto">
        <div className="text-center py-12">
          <p className="text-default-500">Loading case...</p>
        </div>
      </div>
    );
  }

  if (errors.load && !isNewCase) {
    return (
      <div className="flex flex-col gap-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-4">
          <Button isIconOnly variant="light" onPress={handleBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={pageTitle()}>Case Not Found</h1>
        </div>
        <Card>
          <CardBody className="text-center py-8">
            <p className="text-default-500">
              The requested case could not be found.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full px-4 md:px-8 lg:px-12 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          isIconOnly
          className="min-w-0"
          variant="light"
          onPress={handleBack}
        >
          <ArrowLeft />
        </Button>
        <h1 className={pageTitle()}>
          {isNewCase ? "Create Scenario" : "Edit Scenario"}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Scenario Details</h2>
        </CardHeader>
        <CardBody className="space-y-6">
          <div>
            <Input
              isRequired
              errorMessage={errors.name}
              isInvalid={!!errors.name}
              label="Scenario Name"
              placeholder="Enter scenario name"
              value={name}
              onValueChange={setName}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              isRequired
              label="Practice Topic"
              selectedKeys={[topic]}
              errorMessage={errors.topic}
              isInvalid={!!errors.topic}
              onSelectionChange={(keys) => {
                const v = Array.from(keys)[0] as PracticeTopic;
                if (v) {
                  setTopic(v);
                  setSubtype("");
                  if (v === "interview") setPersonaRole("interviewer");
                  else if (v === "pitch") setPersonaRole("audience");
                  else setPersonaRole("counterpart");
                }
              }}
            >
              {PRACTICE_TOPICS.map((t) => (
                <SelectItem key={t}>{TOPIC_META[t].label}</SelectItem>
              ))}
            </Select>
            <Select
              label="Subtype"
              selectedKeys={subtype ? [subtype] : []}
              onSelectionChange={(keys) => {
                const v = Array.from(keys)[0] as string;
                setSubtype(v || "");
              }}
            >
              {TOPIC_SUBTYPES[topic].map((s) => (
                <SelectItem key={s}>{s}</SelectItem>
              ))}
            </Select>
            <Select
              label="Counterpart Role"
              selectedKeys={[personaRole]}
              onSelectionChange={(keys) => {
                const v = Array.from(keys)[0] as string;
                if (v) setPersonaRole(v);
              }}
            >
              <SelectItem key="interviewer">Interviewer</SelectItem>
              <SelectItem key="audience">Audience</SelectItem>
              <SelectItem key="counterpart">Counterpart</SelectItem>
            </Select>
            <Select
              label="Difficulty"
              selectedKeys={[difficulty]}
              onSelectionChange={(keys) => {
                const v = Array.from(keys)[0] as typeof difficulty;
                if (v) setDifficulty(v);
              }}
            >
              <SelectItem key="beginner">Beginner</SelectItem>
              <SelectItem key="intermediate">Intermediate</SelectItem>
              <SelectItem key="advanced">Advanced</SelectItem>
            </Select>
          </div>

          <div>
            <Input
              isReadOnly
              classNames={{ input: "font-mono" }}
              description={
                isNewCase
                  ? "This ID is automatically generated from the name"
                  : "Scenario ID is permanent and cannot be changed"
              }
              label={isNewCase ? "Scenario ID (Auto-generated)" : "Scenario ID"}
              value={generatedId}
            />
          </div>

          {/* Cover Image */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Cover Image</label>
            <p className="text-sm text-default-500">
              Upload an image or generate one with AI based on your case content.
            </p>
            
            {coverImage ? (
              <div className="relative w-full max-w-md">
                <div className="relative w-full h-48 rounded-lg overflow-hidden border border-default-200">
                  <Image
                    src={coverImage}
                    alt="Case cover"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Button
                    size="sm"
                    variant="bordered"
                    startContent={<Sparkles className="w-4 h-4" />}
                    onPress={handleGenerateAICover}
                    isLoading={generatingCover}
                  >
                    Regenerate with AI
                  </Button>
                  <Button
                    size="sm"
                    variant="bordered"
                    startContent={<Upload className="w-4 h-4" />}
                    onPress={() => coverInputRef.current?.click()}
                    isLoading={uploadingCover}
                  >
                    Upload New
                  </Button>
                  <Button
                    size="sm"
                    variant="bordered"
                    color="danger"
                    startContent={<X className="w-4 h-4" />}
                    onPress={handleRemoveCoverImage}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 flex-wrap">
                <Button
                  color="primary"
                  variant="flat"
                  startContent={generatingCover ? null : <Sparkles className="w-4 h-4" />}
                  onPress={handleGenerateAICover}
                  isLoading={generatingCover}
                  isDisabled={!name.trim() && !backgroundInfo.trim()}
                >
                  {generatingCover ? "Generating..." : "Generate with AI"}
                </Button>
                <Button
                  variant="bordered"
                  startContent={uploadingCover ? null : <Upload className="w-4 h-4" />}
                  onPress={() => coverInputRef.current?.click()}
                  isLoading={uploadingCover}
                >
                  Upload Image
                </Button>
              </div>
            )}
            
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverImageUpload}
            />
          </div>

          <div>
            <Textarea
              isRequired
              description="Provide detailed background / briefing for this practice scenario"
              errorMessage={errors.backgroundInfo}
              isInvalid={!!errors.backgroundInfo}
              label="Background Information"
              maxRows={50}
              minRows={6}
              placeholder="Enter background information..."
              value={backgroundInfo}
              onValueChange={setBackgroundInfo}
            />
          </div>

          <div>
            <Textarea
              isRequired
              description="Ask the model to return SCORE, per-skill JSON scores, and EVALUATION text"
              errorMessage={errors.evaluationPrompt}
              isInvalid={!!errors.evaluationPrompt}
              label="Evaluation Prompt"
              maxRows={20}
              minRows={4}
              placeholder="Enter the evaluation criteria or prompt for assessing student interactions..."
              value={evaluationPrompt}
              onValueChange={setEvaluationPrompt}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Counterpart Persona</h3>
                <p className="text-sm text-default-500">
                  Prefer a single 1:1 counterpart (interviewer, audience, or conversation partner)
                </p>
              </div>
              <Button
                color="primary"
                size="sm"
                startContent={<Plus className="w-4 h-4" />}
                variant="bordered"
                onPress={handleAddAvatar}
              >
                Add Avatar
              </Button>
            </div>

            {avatars.length === 0 && (
              <div className="text-center py-8 text-default-400">
                <p>No avatars associated with this case</p>
                <p className="text-sm">
                  Click &quot;Add Avatar&quot; to add your first avatar
                </p>
              </div>
            )}

            <div className="space-y-3">
              {avatars.map((avatar) => (
                <Card key={avatar.id} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input
                          label="Avatar Name"
                          placeholder="e.g., Sarah Chen - CEO"
                          size="sm"
                          value={avatar.name}
                          onValueChange={(val) =>
                            updateAvatar(avatar.id, { name: val })
                          }
                        />
                        <Input
                          label="Role"
                          placeholder="e.g., Chief Executive Officer"
                          size="sm"
                          value={avatar.role}
                          onValueChange={(val) =>
                            updateAvatar(avatar.id, { role: val })
                          }
                        />
                      </div>
                      <Button
                        isIconOnly
                        className="ml-3"
                        color="danger"
                        size="sm"
                        variant="light"
                        onPress={() => handleRemoveAvatar(avatar.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <Select
                      label="Avatar Profile"
                      placeholder="Select an avatar profile"
                      selectedKeys={avatar.profileId ? [avatar.profileId] : []}
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as string;
                        updateAvatar(avatar.id, { profileId: selected || undefined });
                      }}
                    >
                      {profiles.map((profile) => (
                        <SelectItem key={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </Select>

                    <Textarea
                      label="Additional Background Information"
                      maxRows={8}
                      minRows={3}
                      placeholder="Add specific context or background for this avatar in this case..."
                      value={avatar.additionalInfo}
                      onValueChange={(val) =>
                        updateAvatar(avatar.id, { additionalInfo: val })
                      }
                    />
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {errors.save && (
            <div className="p-3 bg-danger-50 border border-danger-200 rounded text-danger-700 text-sm">
              {errors.save}
            </div>
          )}

          <div className="flex gap-3 pt-4 flex-wrap">
            <Button
              color="primary"
              isDisabled={!name.trim() || !backgroundInfo.trim() || !evaluationPrompt.trim() || isLoading}
              isLoading={isSaving}
              startContent={!isSaving ? <Save className="w-4 h-4" /> : null}
              onPress={handleSave}
            >
              {isSaving
                ? "Saving..."
                : isNewCase
                  ? "Create Case"
                  : "Save Changes"}
            </Button>

            {!isNewCase && (
              <Button
                color="danger"
                isDisabled={isSaving || isLoading}
                startContent={<Trash2 className="w-4 h-4" />}
                variant="bordered"
                onPress={onOpen}
              >
                Delete
              </Button>
            )}

            <Button
              isDisabled={isSaving || isLoading}
              variant="bordered"
              onPress={handleBack}
            >
              {hasUnsavedChanges ? "Cancel" : "Back"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Case Summary</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            <div>
              <p className="text-sm font-medium">Case Name:</p>
              <p className="text-sm text-default-600">{name || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Case ID:</p>
              <p className="text-sm text-default-600 font-mono">
                {generatedId || "—"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Number of Avatars:</p>
              <p className="text-sm text-default-600">{avatars.length}</p>
            </div>
          </CardBody>
        </Card>

        {!isNewCase && (
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Quick Actions</h3>
            </CardHeader>
            <CardBody className="space-y-2">
              <Button
                fullWidth
                color="danger"
                variant="flat"
                onPress={onOpen}
              >
                Delete Case
              </Button>
            </CardBody>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal isDismissable={!isDeleting} isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold">Delete Case</h3>
                <p className="text-sm text-default-500">
                  This action cannot be undone.
                </p>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <p className="text-sm">
                    To confirm deletion, please type the case name:{" "}
                    <span className="font-mono font-semibold">{name}</span>
                  </p>
                  <Input
                    errorMessage={errors.delete}
                    isDisabled={isDeleting}
                    isInvalid={!!errors.delete}
                    label="Case Name"
                    placeholder={`Type "${name}" to confirm`}
                    value={deleteConfirmText}
                    onValueChange={setDeleteConfirmText}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button isDisabled={isDeleting} variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="danger"
                  isDisabled={deleteConfirmText !== name}
                  isLoading={isDeleting}
                  onPress={handleDelete}
                >
                  {isDeleting ? "Deleting..." : "Delete Case"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
