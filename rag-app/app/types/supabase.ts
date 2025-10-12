export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      workspaces_extended: {
        Row: {
          id: string
          workspace_id: string
          tier: 'free' | 'pro' | 'team' | 'enterprise'
          storage_used_bytes: number
          storage_limit_bytes: number
          ai_credits_used: number
          ai_credits_limit: number
          custom_domain: string | null
          brand_logo_url: string | null
          settings: Json
          features: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          tier?: 'free' | 'pro' | 'team' | 'enterprise'
          storage_used_bytes?: number
          storage_limit_bytes?: number
          ai_credits_used?: number
          ai_credits_limit?: number
          custom_domain?: string | null
          brand_logo_url?: string | null
          settings?: Json
          features?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          tier?: 'free' | 'pro' | 'team' | 'enterprise'
          storage_used_bytes?: number
          storage_limit_bytes?: number
          ai_credits_used?: number
          ai_credits_limit?: number
          custom_domain?: string | null
          brand_logo_url?: string | null
          settings?: Json
          features?: Json
          created_at?: string
          updated_at?: string
        }
      }
      pages: {
        Row: {
          id: string
          workspace_id: string
          parent_id: string | null
          title: string
          icon: string | null
          cover_image: string | null
          type: 'document' | 'database' | 'kanban_board' | 'calendar_view' | 'gallery' | 'timeline' | 'chat'
          content: Json
          properties: Json
          position: number
          is_archived: boolean
          is_deleted: boolean
          is_template: boolean
          is_locked: boolean
          last_edited_by: string | null
          last_edited_time: string
          created_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
          path: string
          search_vector: string
        }
        Insert: {
          id?: string
          workspace_id: string
          parent_id?: string | null
          title?: string
          icon?: string | null
          cover_image?: string | null
          type?: 'document' | 'database' | 'kanban_board' | 'calendar_view' | 'gallery' | 'timeline' | 'chat'
          content?: Json
          properties?: Json
          position?: number
          is_archived?: boolean
          is_deleted?: boolean
          is_template?: boolean
          is_locked?: boolean
          last_edited_by?: string | null
          last_edited_time?: string
          created_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          parent_id?: string | null
          title?: string
          icon?: string | null
          cover_image?: string | null
          type?: 'document' | 'database' | 'kanban_board' | 'calendar_view' | 'gallery' | 'timeline' | 'chat'
          content?: Json
          properties?: Json
          position?: number
          is_archived?: boolean
          is_deleted?: boolean
          is_template?: boolean
          is_locked?: boolean
          last_edited_by?: string | null
          last_edited_time?: string
          created_by?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      blocks: {
        Row: {
          id: string
          page_id: string
          parent_id: string | null
          type: BlockType
          content: Json
          properties: Json
          position: Json
          metadata: Json
          is_synced: boolean
          sync_source_id: string | null
          version: number
          created_by: string
          created_at: string
          updated_at: string
          updated_by: string | null
          search_vector: string
        }
        Insert: {
          id?: string
          page_id: string
          parent_id?: string | null
          type: BlockType
          content?: Json
          properties?: Json
          position?: Json
          metadata?: Json
          is_synced?: boolean
          sync_source_id?: string | null
          version?: number
          created_by: string
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          page_id?: string
          parent_id?: string | null
          type?: BlockType
          content?: Json
          properties?: Json
          position?: Json
          metadata?: Json
          is_synced?: boolean
          sync_source_id?: string | null
          version?: number
          created_by?: string
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
      }
      block_comments: {
        Row: {
          id: string
          block_id: string
          page_id: string
          user_id: string
          content: string
          resolved: boolean
          resolved_by: string | null
          resolved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          block_id: string
          page_id: string
          user_id: string
          content: string
          resolved?: boolean
          resolved_by?: string | null
          resolved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          block_id?: string
          page_id?: string
          user_id?: string
          content?: string
          resolved?: boolean
          resolved_by?: string | null
          resolved_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      page_permissions: {
        Row: {
          id: string
          page_id: string
          user_id: string | null
          workspace_id: string | null
          can_view: boolean
          can_edit: boolean
          can_comment: boolean
          can_share: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          page_id: string
          user_id?: string | null
          workspace_id?: string | null
          can_view?: boolean
          can_edit?: boolean
          can_comment?: boolean
          can_share?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          page_id?: string
          user_id?: string | null
          workspace_id?: string | null
          can_view?: boolean
          can_edit?: boolean
          can_comment?: boolean
          can_share?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      page_activity: {
        Row: {
          id: string
          page_id: string
          user_id: string
          action: string
          details: Json
          created_at: string
        }
        Insert: {
          id?: string
          page_id: string
          user_id: string
          action: string
          details?: Json
          created_at?: string
        }
        Update: {
          id?: string
          page_id?: string
          user_id?: string
          action?: string
          details?: Json
          created_at?: string
        }
      }
      templates: {
        Row: {
          id: string
          workspace_id: string | null
          is_public: boolean
          category: string
          name: string
          description: string | null
          thumbnail_url: string | null
          content: Json
          use_count: number
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          is_public?: boolean
          category: string
          name: string
          description?: string | null
          thumbnail_url?: string | null
          content: Json
          use_count?: number
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          is_public?: boolean
          category?: string
          name?: string
          description?: string | null
          thumbnail_url?: string | null
          content?: Json
          use_count?: number
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      embeddings: {
        Row: {
          id: string
          page_id: string | null
          block_id: string | null
          content_hash: string
          embedding: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          page_id?: string | null
          block_id?: string | null
          content_hash: string
          embedding?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          page_id?: string | null
          block_id?: string | null
          content_hash?: string
          embedding?: string | null
          metadata?: Json
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_page_hierarchy: {
        Args: {
          page_uuid: string
        }
        Returns: {
          id: string
          parent_id: string | null
          title: string
          level: number
          path: string
        }[]
      }
    }
    Enums: {
      block_type: BlockType
      page_type: 'document' | 'database' | 'kanban_board' | 'calendar_view' | 'gallery' | 'timeline' | 'chat'
      workspace_tier: 'free' | 'pro' | 'team' | 'enterprise'
    }
  }
}

export type BlockType =
  | 'text'
  | 'heading'
  | 'bullet_list'
  | 'numbered_list'
  | 'checkbox'
  | 'code'
  | 'quote'
  | 'divider'
  | 'image'
  | 'video'
  | 'file'
  | 'table'
  | 'kanban'
  | 'calendar'
  | 'spreadsheet'
  | 'embed'
  | 'link'
  | 'toggle'
  | 'callout'
  | 'synced_block'
  | 'ai_block'

// Helper types
export type Page = Database['public']['Tables']['pages']['Row']
export type NewPage = Database['public']['Tables']['pages']['Insert']
export type UpdatePage = Database['public']['Tables']['pages']['Update']

export type Block = Database['public']['Tables']['blocks']['Row']
export type NewBlock = Database['public']['Tables']['blocks']['Insert']
export type UpdateBlock = Database['public']['Tables']['blocks']['Update']

export type WorkspaceExtended = Database['public']['Tables']['workspaces_extended']['Row']
export type PagePermission = Database['public']['Tables']['page_permissions']['Row']
export type Template = Database['public']['Tables']['templates']['Row']