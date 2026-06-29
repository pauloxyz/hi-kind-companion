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
      applications: {
        Row: {
          attached_media_ids: string[] | null
          attached_video_id: string | null
          contact_method: string | null
          cover_letter_en: string | null
          employer_id: string | null
          follow_up_due_at: string | null
          follow_up_sent_at: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          job_id: string | null
          last_reply_check_at: string | null
          notes: string | null
          owner_id: string
          reply_from: string | null
          reply_received_at: string | null
          reply_snippet: string | null
          responded_at: string | null
          resume_id: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          attached_media_ids?: string[] | null
          attached_video_id?: string | null
          contact_method?: string | null
          cover_letter_en?: string | null
          employer_id?: string | null
          follow_up_due_at?: string | null
          follow_up_sent_at?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          job_id?: string | null
          last_reply_check_at?: string | null
          notes?: string | null
          owner_id: string
          reply_from?: string | null
          reply_received_at?: string | null
          reply_snippet?: string | null
          responded_at?: string | null
          resume_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          attached_media_ids?: string[] | null
          attached_video_id?: string | null
          contact_method?: string | null
          cover_letter_en?: string | null
          employer_id?: string | null
          follow_up_due_at?: string | null
          follow_up_sent_at?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          job_id?: string | null
          last_reply_check_at?: string | null
          notes?: string | null
          owner_id?: string
          reply_from?: string | null
          reply_received_at?: string | null
          reply_snippet?: string | null
          responded_at?: string | null
          resume_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_attached_video_id_fkey"
            columns: ["attached_video_id"]
            isOneToOne: false
            referencedRelation: "intro_video"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      employers: {
        Row: {
          created_at: string | null
          employer_name: string
          flagged_reason: string | null
          id: string
          is_flagged_suspicious: boolean | null
          notes: string | null
          owner_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          employer_name: string
          flagged_reason?: string | null
          id?: string
          is_flagged_suspicious?: boolean | null
          notes?: string | null
          owner_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          employer_name?: string
          flagged_reason?: string | null
          id?: string
          is_flagged_suspicious?: boolean | null
          notes?: string | null
          owner_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      english_flashcard_reviews: {
        Row: {
          card_index: number
          correct_streak: number
          created_at: string
          id: string
          last_review_at: string
          lesson_id: string
          mastered: boolean
          next_due_at: string
          total_correct: number
          total_seen: number
          updated_at: string
          user_id: string
        }
        Insert: {
          card_index: number
          correct_streak?: number
          created_at?: string
          id?: string
          last_review_at?: string
          lesson_id: string
          mastered?: boolean
          next_due_at?: string
          total_correct?: number
          total_seen?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          card_index?: number
          correct_streak?: number
          created_at?: string
          id?: string
          last_review_at?: string
          lesson_id?: string
          mastered?: boolean
          next_due_at?: string
          total_correct?: number
          total_seen?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "english_flashcard_reviews_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "english_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      english_lessons: {
        Row: {
          common_mistakes: Json
          created_at: string
          cultural_note: string
          dialogue: Json
          estimated_minutes: number
          flashcards: Json
          goal_pt: string
          grammar_tip: string
          id: string
          intro_pt: string
          is_free: boolean
          listening_quiz: Json
          mastery_threshold: number
          module_id: string
          phrases: Json
          pronunciation_tip: string
          quiz: Json
          slug: string
          sort_order: number
          title_en: string
          title_pt: string
          warmup_pt: string | null
        }
        Insert: {
          common_mistakes?: Json
          created_at?: string
          cultural_note?: string
          dialogue?: Json
          estimated_minutes?: number
          flashcards?: Json
          goal_pt?: string
          grammar_tip?: string
          id?: string
          intro_pt?: string
          is_free?: boolean
          listening_quiz?: Json
          mastery_threshold?: number
          module_id: string
          phrases?: Json
          pronunciation_tip?: string
          quiz?: Json
          slug: string
          sort_order?: number
          title_en: string
          title_pt: string
          warmup_pt?: string | null
        }
        Update: {
          common_mistakes?: Json
          created_at?: string
          cultural_note?: string
          dialogue?: Json
          estimated_minutes?: number
          flashcards?: Json
          goal_pt?: string
          grammar_tip?: string
          id?: string
          intro_pt?: string
          is_free?: boolean
          listening_quiz?: Json
          mastery_threshold?: number
          module_id?: string
          phrases?: Json
          pronunciation_tip?: string
          quiz?: Json
          slug?: string
          sort_order?: number
          title_en?: string
          title_pt?: string
          warmup_pt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "english_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "english_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      english_modules: {
        Row: {
          created_at: string
          description_pt: string
          icon: string
          id: string
          level: string
          slug: string
          sort_order: number
          title_en: string
          title_pt: string
        }
        Insert: {
          created_at?: string
          description_pt: string
          icon?: string
          id?: string
          level?: string
          slug: string
          sort_order?: number
          title_en: string
          title_pt: string
        }
        Update: {
          created_at?: string
          description_pt?: string
          icon?: string
          id?: string
          level?: string
          slug?: string
          sort_order?: number
          title_en?: string
          title_pt?: string
        }
        Relationships: []
      }
      english_progress: {
        Row: {
          attempts: number
          best_score: number
          completed_at: string
          current_step: number
          lesson_id: string
          mastered_at: string | null
          quiz_correct: number
          quiz_total: number
          user_id: string
        }
        Insert: {
          attempts?: number
          best_score?: number
          completed_at?: string
          current_step?: number
          lesson_id: string
          mastered_at?: string | null
          quiz_correct?: number
          quiz_total?: number
          user_id: string
        }
        Update: {
          attempts?: number
          best_score?: number
          completed_at?: string
          current_step?: number
          lesson_id?: string
          mastered_at?: string | null
          quiz_correct?: number
          quiz_total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "english_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "english_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_import_logs: {
        Row: {
          error_message: string | null
          feed_type: string | null
          id: string
          records_imported: number | null
          run_at: string | null
          status: string | null
        }
        Insert: {
          error_message?: string | null
          feed_type?: string | null
          id?: string
          records_imported?: number | null
          run_at?: string | null
          status?: string | null
        }
        Update: {
          error_message?: string | null
          feed_type?: string | null
          id?: string
          records_imported?: number | null
          run_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      intro_video: {
        Row: {
          duration_seconds: number | null
          id: string
          is_active: boolean | null
          language: string | null
          owner_id: string
          recorded_at: string | null
          video_url: string
        }
        Insert: {
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          owner_id: string
          recorded_at?: string | null
          video_url: string
        }
        Update: {
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          owner_id?: string
          recorded_at?: string | null
          video_url?: string
        }
        Relationships: []
      }
      job_alerts: {
        Row: {
          category: string | null
          created_at: string
          id: string
          last_seen_at: string
          min_match: number | null
          min_wage: number | null
          name: string
          owner_id: string
          state: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          min_match?: number | null
          min_wage?: number | null
          name: string
          owner_id: string
          state?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          min_match?: number | null
          min_wage?: number | null
          name?: string
          owner_id?: string
          state?: string | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          employer_address: string | null
          employer_name: string | null
          end_date: string | null
          external_case_number: string | null
          id: string
          imported_at: string | null
          job_title: string | null
          posted_date: string | null
          raw_feed_data: Json | null
          recruitment_contact_name: string | null
          recruitment_email: string | null
          recruitment_phone: string | null
          recruitment_website: string | null
          start_date: string | null
          total_openings: number | null
          visa_type: string | null
          wage_offered: number | null
          wage_unit: string | null
          worksite_city: string | null
          worksite_state: string | null
        }
        Insert: {
          employer_address?: string | null
          employer_name?: string | null
          end_date?: string | null
          external_case_number?: string | null
          id?: string
          imported_at?: string | null
          job_title?: string | null
          posted_date?: string | null
          raw_feed_data?: Json | null
          recruitment_contact_name?: string | null
          recruitment_email?: string | null
          recruitment_phone?: string | null
          recruitment_website?: string | null
          start_date?: string | null
          total_openings?: number | null
          visa_type?: string | null
          wage_offered?: number | null
          wage_unit?: string | null
          worksite_city?: string | null
          worksite_state?: string | null
        }
        Update: {
          employer_address?: string | null
          employer_name?: string | null
          end_date?: string | null
          external_case_number?: string | null
          id?: string
          imported_at?: string | null
          job_title?: string | null
          posted_date?: string | null
          raw_feed_data?: Json | null
          recruitment_contact_name?: string | null
          recruitment_email?: string | null
          recruitment_phone?: string | null
          recruitment_website?: string | null
          start_date?: string | null
          total_openings?: number | null
          visa_type?: string | null
          wage_offered?: number | null
          wage_unit?: string | null
          worksite_city?: string | null
          worksite_state?: string | null
        }
        Relationships: []
      }
      my_profile: {
        Row: {
          application_quality_score: number | null
          birth_date: string | null
          country: string | null
          full_name: string | null
          has_prior_h2_experience: boolean | null
          id: string
          languages: string[] | null
          onboarding_completed_at: string | null
          owner_id: string
          phone: string | null
          photo_url: string | null
          public_headline: string | null
          public_page_enabled: boolean
          public_slug: string | null
          resume_completion_pct: number | null
          updated_at: string | null
        }
        Insert: {
          application_quality_score?: number | null
          birth_date?: string | null
          country?: string | null
          full_name?: string | null
          has_prior_h2_experience?: boolean | null
          id?: string
          languages?: string[] | null
          onboarding_completed_at?: string | null
          owner_id: string
          phone?: string | null
          photo_url?: string | null
          public_headline?: string | null
          public_page_enabled?: boolean
          public_slug?: string | null
          resume_completion_pct?: number | null
          updated_at?: string | null
        }
        Update: {
          application_quality_score?: number | null
          birth_date?: string | null
          country?: string | null
          full_name?: string | null
          has_prior_h2_experience?: boolean | null
          id?: string
          languages?: string[] | null
          onboarding_completed_at?: string | null
          owner_id?: string
          phone?: string | null
          photo_url?: string | null
          public_headline?: string | null
          public_page_enabled?: boolean
          public_slug?: string | null
          resume_completion_pct?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profile_views: {
        Row: {
          id: string
          owner_id: string
          referer: string | null
          slug: string
          user_agent: string | null
          viewed_at: string
          viewer_ip: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          referer?: string | null
          slug: string
          user_agent?: string | null
          viewed_at?: string
          viewer_ip?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          referer?: string | null
          slug?: string
          user_agent?: string | null
          viewed_at?: string
          viewer_ip?: string | null
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      resume_experiences: {
        Row: {
          description_en: string | null
          description_pt: string | null
          employer_name: string | null
          end_date: string | null
          id: string
          job_title: string | null
          job_title_en: string | null
          location: string | null
          owner_id: string
          resume_id: string | null
          sort_order: number | null
          start_date: string | null
        }
        Insert: {
          description_en?: string | null
          description_pt?: string | null
          employer_name?: string | null
          end_date?: string | null
          id?: string
          job_title?: string | null
          job_title_en?: string | null
          location?: string | null
          owner_id: string
          resume_id?: string | null
          sort_order?: number | null
          start_date?: string | null
        }
        Update: {
          description_en?: string | null
          description_pt?: string | null
          employer_name?: string | null
          end_date?: string | null
          id?: string
          job_title?: string | null
          job_title_en?: string | null
          location?: string | null
          owner_id?: string
          resume_id?: string | null
          sort_order?: number | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resume_experiences_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_skills: {
        Row: {
          category: string | null
          id: string
          owner_id: string
          resume_id: string | null
          skill_name: string | null
        }
        Insert: {
          category?: string | null
          id?: string
          owner_id: string
          resume_id?: string | null
          skill_name?: string | null
        }
        Update: {
          category?: string | null
          id?: string
          owner_id?: string
          resume_id?: string | null
          skill_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resume_skills_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          availability_end: string | null
          availability_start: string | null
          availability_type: string | null
          id: string
          owner_id: string
          pdf_url: string | null
          summary_en: string | null
          summary_pt: string | null
          template_style: string | null
          updated_at: string | null
        }
        Insert: {
          availability_end?: string | null
          availability_start?: string | null
          availability_type?: string | null
          id?: string
          owner_id: string
          pdf_url?: string | null
          summary_en?: string | null
          summary_pt?: string | null
          template_style?: string | null
          updated_at?: string | null
        }
        Update: {
          availability_end?: string | null
          availability_start?: string | null
          availability_type?: string | null
          id?: string
          owner_id?: string
          pdf_url?: string | null
          summary_en?: string | null
          summary_pt?: string | null
          template_style?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      saved_jobs: {
        Row: {
          created_at: string
          id: string
          job_id: string
          note: string | null
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          note?: string | null
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          note?: string | null
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alert_acks: {
        Row: {
          acked_at: string
          acked_by: string
          alert_key: string
          hour: string
          id: string
          ip_address: unknown
          note: string | null
          risk_level: string
        }
        Insert: {
          acked_at?: string
          acked_by: string
          alert_key: string
          hour: string
          id?: string
          ip_address?: unknown
          note?: string | null
          risk_level: string
        }
        Update: {
          acked_at?: string
          acked_by?: string
          alert_key?: string
          hour?: string
          id?: string
          ip_address?: unknown
          note?: string | null
          risk_level?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          created_at: string
          email_hash: string | null
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json
          notified_at: string | null
          resource: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email_hash?: string | null
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          notified_at?: string | null
          resource?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email_hash?: string | null
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          notified_at?: string | null
          resource?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_retention_policy: {
        Row: {
          event_type: string
          retain_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          event_type: string
          retain_days: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          event_type?: string
          retain_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      seo_scan_runs: {
        Row: {
          created_at: string
          critical_count: number
          details: Json
          duration_ms: number
          high_count: number
          id: string
          low_count: number
          medium_count: number
          routes_in_sitemap: number
          routes_total: number
          source: string
          tests_failed: number
          tests_passed: number
          tests_total: number
        }
        Insert: {
          created_at?: string
          critical_count?: number
          details?: Json
          duration_ms?: number
          high_count?: number
          id?: string
          low_count?: number
          medium_count?: number
          routes_in_sitemap?: number
          routes_total?: number
          source?: string
          tests_failed?: number
          tests_passed?: number
          tests_total?: number
        }
        Update: {
          created_at?: string
          critical_count?: number
          details?: Json
          duration_ms?: number
          high_count?: number
          id?: string
          low_count?: number
          medium_count?: number
          routes_in_sitemap?: number
          routes_total?: number
          source?: string
          tests_failed?: number
          tests_passed?: number
          tests_total?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount_cents: number | null
          created_at: string
          currency: string | null
          current_period_end: string | null
          id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      uptime_checks: {
        Row: {
          checked_at: string
          checks: Json | null
          error: string | null
          http_status: number | null
          id: string
          latency_ms: number | null
          status: string
        }
        Insert: {
          checked_at?: string
          checks?: Json | null
          error?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          status: string
        }
        Update: {
          checked_at?: string
          checks?: Json | null
          error?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visa_checklist_items: {
        Row: {
          completed_at: string | null
          id: string
          is_completed: boolean | null
          owner_id: string
          sort_order: number | null
          step_key: string
          step_label: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          is_completed?: boolean | null
          owner_id: string
          sort_order?: number | null
          step_key: string
          step_label: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          is_completed?: boolean | null
          owner_id?: string
          sort_order?: number | null
          step_key?: string
          step_label?: string
        }
        Relationships: []
      }
      work_media: {
        Row: {
          caption: string | null
          category: string | null
          id: string
          is_featured: boolean | null
          media_type: string | null
          media_url: string
          owner_id: string
          uploaded_at: string | null
        }
        Insert: {
          caption?: string | null
          category?: string | null
          id?: string
          is_featured?: boolean | null
          media_type?: string | null
          media_url: string
          owner_id: string
          uploaded_at?: string | null
        }
        Update: {
          caption?: string | null
          category?: string | null
          id?: string
          is_featured?: boolean | null
          media_type?: string | null
          media_url?: string
          owner_id?: string
          uploaded_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      security_hibp_daily: {
        Row: {
          auth_failures: number | null
          day: string | null
          hibp_blocks: number | null
          weak_blocks: number | null
        }
        Relationships: []
      }
      security_pii_access_recent: {
        Row: {
          created_at: string | null
          metadata: Json | null
          resource: string | null
          user_id: string | null
        }
        Relationships: []
      }
      security_risk_alerts: {
        Row: {
          auth_failures: number | null
          hibp_blocks: number | null
          hour: string | null
          ip_address: unknown
          risk_level: string | null
          total_events: number | null
          weak_blocks: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_rate_limit: {
        Args: { _key: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
      escalate_high_risk_alerts: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_pro: { Args: { _user_id: string }; Returns: boolean }
      purge_rate_limit_buckets: { Args: never; Returns: number }
      purge_security_audit_log: { Args: never; Returns: number }
      purge_uptime_checks: { Args: never; Returns: undefined }
      record_admin_denial: { Args: { _resource: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
