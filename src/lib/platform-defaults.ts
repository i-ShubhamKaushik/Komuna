export interface PlatformSettings {
  general: {
    platform_name: string;
    tagline: string;
    description: string;
    support_email: string;
    contact_email: string;
    logo_url: string | null;
    favicon_url: string | null;
  };
  appearance: {
    primary_color: string;
    secondary_color: string;
    theme: string;
  };
  registration: {
    allow_registration: boolean;
    require_email_verification: boolean;
    allow_username_changes: boolean;
  };
  communities: {
    allow_community_requests: boolean;
    require_approval: boolean;
    max_communities_per_user: number;
  };
  maintenance: {
    maintenance_mode: boolean;
    maintenance_message: string;
  };
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  general: {
    platform_name: "Komuna",
    tagline: "One platform. Every community.",
    description:
      "Komuna is one platform for every community — discuss, debate, recommend and connect.",
    support_email: "support@komuna.app",
    contact_email: "hello@komuna.app",
    logo_url: null,
    favicon_url: null,
  },
  appearance: {
    primary_color: "#7C5CFF",
    secondary_color: "#00D4FF",
    theme: "dark",
  },
  registration: {
    allow_registration: true,
    require_email_verification: false,
    allow_username_changes: true,
  },
  communities: {
    allow_community_requests: true,
    require_approval: true,
    max_communities_per_user: 3,
  },
  maintenance: {
    maintenance_mode: false,
    maintenance_message: "Komuna is undergoing maintenance. We will be back shortly.",
  },
};

export const INTEREST_OPTIONS = [
  "Gaming",
  "Anime",
  "Movies",
  "TV",
  "Sports",
  "Technology",
  "Programming",
  "Music",
  "Art",
  "Education",
  "Cars",
] as const;

export const SECTION_TYPES = [
  "discussion",
  "recommendation",
  "spoiler",
  "debate",
  "poll",
  "gallery",
  "chat",
  "event",
] as const;
