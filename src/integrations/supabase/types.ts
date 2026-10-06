export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      archive_items: {
        Row: {
          added_by: string
          category: string
          couple_id: string
          created_at: string
          genre: string | null
          id: string
          poster_url: string | null
          priority: string | null
          reason: string | null
          release_year: string | null
          title: string
          tmdb_id: string | null
          type: string
          watch_type: string | null
          watched_date: string | null
        }
        Insert: {
          added_by: string
          category?: string
          couple_id: string
          created_at?: string
          genre?: string | null
          id?: string
          poster_url?: string | null
          priority?: string | null
          reason?: string | null
          release_year?: string | null
          title: string
          tmdb_id?: string | null
          type: string
          watch_type?: string | null
          watched_date?: string | null
        }
        Update: {
          added_by?: string
          category?: string
          couple_id?: string
          created_at?: string
          genre?: string | null
          id?: string
          poster_url?: string | null
          priority?: string | null
          reason?: string | null
          release_year?: string | null
          title?: string
          tmdb_id?: string | null
          type?: string
          watch_type?: string | null
          watched_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "archive_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_items_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_ratings: {
        Row: {
          archive_item_id: string
          comment: string | null
          created_at: string
          id: string
          score: number
          user_id: string
        }
        Insert: {
          archive_item_id: string
          comment?: string | null
          created_at?: string
          id?: string
          score: number
          user_id: string
        }
        Update: {
          archive_item_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "archive_ratings_archive_item_id_fkey"
            columns: ["archive_item_id"]
            isOneToOne: false
            referencedRelation: "archive_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      couples: {
        Row: {
          anniversary: string | null
          couple_name: string | null
          created_at: string
          id: string
          invite_code: string
          user1_id: string
          user2_id: string | null
        }
        Insert: {
          anniversary?: string | null
          couple_name?: string | null
          created_at?: string
          id?: string
          invite_code: string
          user1_id: string
          user2_id?: string | null
        }
        Update: {
          anniversary?: string | null
          couple_name?: string | null
          created_at?: string
          id?: string
          invite_code?: string
          user1_id?: string
          user2_id?: string | null
        }
        Relationships: []
      }
      favorite_places: {
        Row: {
          couple_id: string
          created_at: string
          created_by: string
          id: string
          lat: number | null
          lng: number | null
          location_name: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          created_by: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_name: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          created_by?: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_places_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_places_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      memos: {
        Row: {
          content: string
          created_at: string
          id: string
          record_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          record_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          record_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memos_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          created_at: string
          id: string
          order: number
          record_id: string
          storage_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          order?: number
          record_id: string
          storage_url: string
        }
        Update: {
          created_at?: string
          id?: string
          order?: number
          record_id?: string
          storage_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string | null
          id: string
          subscription: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          id?: string
          subscription: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          id?: string
          subscription?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          created_at: string
          id: string
          record_id: string
          score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          record_id: string
          score: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          record_id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      records: {
        Row: {
          author_id: string
          couple_id: string
          created_at: string
          date: string
          id: string
          lat: number | null
          lng: number | null
          location_name: string | null
          memo: string | null
          tag: string | null
        }
        Insert: {
          author_id: string
          couple_id: string
          created_at?: string
          date: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          memo?: string | null
          tag?: string | null
        }
        Update: {
          author_id?: string
          couple_id?: string
          created_at?: string
          date?: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          memo?: string | null
          tag?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "records_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          couple_id: string | null
          created_at: string
          id: string
          nickname: string | null
        }
        Insert: {
          avatar_url?: string | null
          couple_id?: string | null
          created_at?: string
          id: string
          nickname?: string | null
        }
        Update: {
          avatar_url?: string | null
          couple_id?: string | null
          created_at?: string
          id?: string
          nickname?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_couple_id: { Args: never; Returns: string }
      join_couple_by_invite: {
        Args: { p_invite_code: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
