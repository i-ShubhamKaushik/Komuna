import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PenLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPost } from "@/lib/queries";

interface Section {
  id: string;
  name: string;
}

interface PostComposerProps {
  communityId: string;
  userId: string;
  sections: Section[];
  defaultSectionId?: string | null;
}

export function PostComposer({
  communityId,
  userId,
  sections,
  defaultSectionId,
}: PostComposerProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sectionId, setSectionId] = useState<string>(defaultSectionId ?? sections[0]?.id ?? "");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [isNsfw, setIsNsfw] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createPost({
        communityId,
        sectionId: sectionId || null,
        authorId: userId,
        title: title.trim(),
        body: body.trim(),
        isSpoiler,
        isNsfw,
      }),
    onSuccess: () => {
      toast.success("Post published");
      setTitle("");
      setBody("");
      setIsSpoiler(false);
      setIsNsfw(false);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not publish your post"),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="surface-panel text-muted-foreground hover:text-foreground flex w-full items-center gap-2.5 p-4 text-sm transition-colors"
      >
        <PenLine className="h-4 w-4" /> Share something with this community…
      </button>
    );
  }

  return (
    <form
      className="surface-panel space-y-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim().length < 3) {
          toast.error("Give your post a title of at least 3 characters");
          return;
        }
        mutation.mutate();
      }}
    >
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Post title"
        maxLength={140}
      />
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write your post…"
        rows={5}
        maxLength={5000}
      />
      {sections.length > 0 ? (
        <Select value={sectionId} onValueChange={setSectionId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a section" />
          </SelectTrigger>
          <SelectContent>
            {sections.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                {section.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-2">
          <Switch id="spoiler" checked={isSpoiler} onCheckedChange={setIsSpoiler} />
          <Label htmlFor="spoiler" className="text-xs">
            Spoiler
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="nsfw" checked={isNsfw} onCheckedChange={setIsNsfw} />
          <Label htmlFor="nsfw" className="text-xs">
            18+
          </Label>
        </div>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="brand" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </div>
    </form>
  );
}
