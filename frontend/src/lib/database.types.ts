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
      animals: {
        Row: {
          birth_date: string | null
          created_at: string
          ear_tag: string | null
          id: string
          mother_id: string | null
          name: string | null
          notes: string | null
          sex: string
          species: string
          stage: string | null
          status: string
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          ear_tag?: string | null
          id?: string
          mother_id?: string | null
          name?: string | null
          notes?: string | null
          sex: string
          species: string
          stage?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          ear_tag?: string | null
          id?: string
          mother_id?: string | null
          name?: string | null
          notes?: string | null
          sex?: string
          species?: string
          stage?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "animals_mother_id_fkey"
            columns: ["mother_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
        ]
      }
      calf_births: {
        Row: {
          birth_date: string
          calf_id: string | null
          cow_id: string
          created_at: string
          id: string
          notes: string | null
        }
        Insert: {
          birth_date: string
          calf_id?: string | null
          cow_id: string
          created_at?: string
          id?: string
          notes?: string | null
        }
        Update: {
          birth_date?: string
          calf_id?: string | null
          cow_id?: string
          created_at?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calf_births_calf_id_fkey"
            columns: ["calf_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calf_births_cow_id_fkey"
            columns: ["cow_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
        ]
      }
      cattle_details: {
        Row: {
          animal_id: string
          birth_count: number
          conception_date: string | null
          expected_birth: string | null
          id: string
          is_pregnant: boolean
          last_birth_date: string | null
        }
        Insert: {
          animal_id: string
          birth_count?: number
          conception_date?: string | null
          expected_birth?: string | null
          id?: string
          is_pregnant?: boolean
          last_birth_date?: string | null
        }
        Update: {
          animal_id?: string
          birth_count?: number
          conception_date?: string | null
          expected_birth?: string | null
          id?: string
          is_pregnant?: boolean
          last_birth_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cattle_details_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: true
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          min_quantity: number
          name: string
          quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          min_quantity?: number
          name: string
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          min_quantity?: number
          name?: string
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          date: string
          id: string
          item_id: string
          notes: string | null
          quantity: number
          type: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          item_id: string
          notes?: string | null
          quantity: number
          type: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      litters: {
        Row: {
          birth_date: string
          born_alive: number
          created_at: string
          id: string
          notes: string | null
          sow_id: string
          total_born: number
        }
        Insert: {
          birth_date: string
          born_alive?: number
          created_at?: string
          id?: string
          notes?: string | null
          sow_id: string
          total_born?: number
        }
        Update: {
          birth_date?: string
          born_alive?: number
          created_at?: string
          id?: string
          notes?: string | null
          sow_id?: string
          total_born?: number
        }
        Relationships: [
          {
            foreignKeyName: "litters_sow_id_fkey"
            columns: ["sow_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
        ]
      }
      pig_details: {
        Row: {
          animal_id: string
          expected_birth: string | null
          id: string
          is_pregnant: boolean
          litter_count: number
          service_date: string | null
        }
        Insert: {
          animal_id: string
          expected_birth?: string | null
          id?: string
          is_pregnant?: boolean
          litter_count?: number
          service_date?: string | null
        }
        Update: {
          animal_id?: string
          expected_birth?: string | null
          id?: string
          is_pregnant?: boolean
          litter_count?: number
          service_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pig_details_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: true
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          animal_id: string | null
          category: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          animal_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          animal_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccination_records: {
        Row: {
          animal_id: string
          applied_by: string | null
          applied_date: string
          created_at: string
          id: string
          inventory_item_id: string | null
          next_date: string | null
          notes: string | null
          vaccine_id: string | null
        }
        Insert: {
          animal_id: string
          applied_by?: string | null
          applied_date: string
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          next_date?: string | null
          notes?: string | null
          vaccine_id?: string | null
        }
        Update: {
          animal_id?: string
          applied_by?: string | null
          applied_date?: string
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          next_date?: string | null
          notes?: string | null
          vaccine_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vaccination_records_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaccination_records_vaccine_id_fkey"
            columns: ["vaccine_id"]
            isOneToOne: false
            referencedRelation: "vaccines"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccines: {
        Row: {
          created_at: string
          description: string | null
          disease_target: string | null
          id: string
          manufacturer: string | null
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          disease_target?: string | null
          id?: string
          manufacturer?: string | null
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          disease_target?: string | null
          id?: string
          manufacturer?: string | null
          name?: string
        }
        Relationships: []
      }
    }
      milk_sessions: {
        Row: {
          created_at: string
          id: string
          liters: number
          notes: string | null
          recorded_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          liters: number
          notes?: string | null
          recorded_date?: string
        }
        Update: {
          created_at?: string
          id?: string
          liters?: number
          notes?: string | null
          recorded_date?: string
        }
        Relationships: []
      }
      milk_records: {
        Row: {
          animal_id: string
          created_at: string
          id: string
          liters: number
          notes: string | null
          recorded_date: string
        }
        Insert: {
          animal_id: string
          created_at?: string
          id?: string
          liters: number
          notes?: string | null
          recorded_date?: string
        }
        Update: {
          animal_id?: string
          created_at?: string
          id?: string
          liters?: number
          notes?: string | null
          recorded_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "milk_records_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          }
        ]
      }
      heat_records: {
        Row: {
          animal_id: string
          created_at: string
          id: string
          notes: string | null
          observed_date: string
        }
        Insert: {
          animal_id: string
          created_at?: string
          id?: string
          notes?: string | null
          observed_date: string
        }
        Update: {
          animal_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          observed_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "heat_records_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_dashboard_stats: { Args: never; Returns: Json }
      get_low_stock_items: {
        Args: never
        Returns: {
          category: string
          item_id: string
          item_name: string
          min_quantity: number
          quantity: number
          unit: string
        }[]
      }
      get_upcoming_births: {
        Args: { days_ahead?: number }
        Returns: {
          animal_id: string
          animal_name: string
          days_remaining: number
          ear_tag: string
          expected_birth: string
          species: string
        }[]
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
