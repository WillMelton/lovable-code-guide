# Product Roadmap System - Complete Replication Guide

**Version**: 1.0  
**Last Updated**: January 2026  
**Complexity**: Advanced  
**Estimated Implementation Time**: 3-5 days

---

## Table of Contents

1. [Overview](#1-overview)
2. [Feature Summary](#2-feature-summary)
3. [Prerequisites](#3-prerequisites)
4. [Database Schema](#4-database-schema)
5. [Storage Configuration](#5-storage-configuration)
6. [Backend (Edge Functions)](#6-backend-edge-functions)
7. [Frontend Components](#7-frontend-components)
8. [Hooks & Data Layer](#8-hooks--data-layer)
9. [Utility Functions](#9-utility-functions)
10. [Staged Implementation Plan](#10-staged-implementation-plan)
11. [Testing Checklist](#11-testing-checklist)
12. [Advanced Customizations](#12-advanced-customizations)

---

## 1. Overview

This guide provides a complete blueprint for replicating a fully-featured product roadmap system. The system allows teams to track development items through various stages, with rich collaboration features including:

- **Item Management**: Create, edit, delete roadmap items with full metadata
- **Status Workflow**: Move items through planning → development → review → release stages
- **User Assignment**: Multi-user assignment with email notifications
- **Commenting System**: Threaded comments with @mention support
- **File Attachments**: Drag-drop, paste screenshots, capture screen
- **Voice Input**: Voice-to-text transcription for descriptions and notes
- **Dependencies**: Track inter-item dependencies (blocks/blocked by)
- **Change Requests**: Formal change request workflow
- **Deep Linking**: URL-based item highlighting for notifications
- **Real-time Updates**: React Query invalidation for live updates

---

## 2. Feature Summary

### Core Features

| Feature | Description |
|---------|-------------|
| CRUD Operations | Full create, read, update, delete for roadmap items |
| Status Workflow | 8 statuses: in_planning, planned, next_sprint, in_progress, in_review, changes_needed, information_needed, released |
| Priority Levels | 4 levels: critical, high, medium, low |
| Progress Tracking | 0-100% progress bar per item |
| Due Dates | Date picker with overdue highlighting |
| Categories | Feature, Enhancement, Bug Fix, Technical Debt, etc. |
| Effort Estimation | Story points (1-13 scale) |
| Quarter/Year | Roadmap timeline planning |

### Collaboration Features

| Feature | Description |
|---------|-------------|
| Multi-user Assignment | Assign multiple team members to items |
| Assignment Notifications | Email + in-app notifications on assignment |
| Comments | Threaded comments on items |
| @Mentions | Mention team members with @username |
| Mention Notifications | Email + in-app notifications on mention |
| Follow-up Notes | Separate notes field for updates |

### Attachment Features

| Feature | Description |
|---------|-------------|
| File Upload | Click to upload (max 10MB) |
| Drag & Drop | Drop files into the dialog |
| Paste Screenshots | Ctrl+V to paste clipboard images |
| Screen Capture | Capture screen via browser API |
| Image Preview | Inline image thumbnails |
| File Download | Click to download attachments |

### Advanced Features

| Feature | Description |
|---------|-------------|
| Voice Input | Whisper API transcription for voice-to-text |
| Dependencies | Track "depends on" and "blocks" relationships |
| Change Requests | Formal change request workflow with addressing |
| Deep Linking | `/roadmap?item={id}` for notification links |
| ID Copying | Click to copy short ID to clipboard |
| Search & Filter | Filter by status, priority, assignment |
| Tabs | Active / Implemented / Changes Needed views |

---

## 3. Prerequisites

### Required Dependencies

```json
{
  "@tanstack/react-query": "^5.x",
  "@supabase/supabase-js": "^2.x",
  "lucide-react": "^0.x",
  "date-fns": "^3.x",
  "sonner": "^1.x",
  "@radix-ui/react-dialog": "^1.x",
  "@radix-ui/react-select": "^2.x",
  "@radix-ui/react-collapsible": "^1.x",
  "@radix-ui/react-dropdown-menu": "^2.x",
  "@radix-ui/react-tabs": "^1.x",
  "@radix-ui/react-progress": "^1.x",
  "@radix-ui/react-avatar": "^1.x",
  "@radix-ui/react-popover": "^1.x"
}
```

### Required Secrets (Edge Functions)

| Secret | Purpose |
|--------|---------|
| `RESEND_API_KEY` | Email notifications via Resend |
| `OPENAI_API_KEY` | Whisper API for voice transcription |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database access |

### Required Tables (Pre-existing)

- `user_profile` - User profiles with `id`, `full_name`, `avatar_url`, `email`
- `user_roles` - Role assignments with `user_id`, `role`
- `user_notifications` - In-app notifications
- `email_queue` - Email tracking (optional)
- `platform_settings` - Site configuration (optional)

---

## 4. Database Schema

### Stage 1: Enums

```sql
-- Status enum with full workflow
CREATE TYPE public.roadmap_status AS ENUM (
  'backlog',
  'in_planning', 
  'planned', 
  'next_sprint', 
  'in_progress', 
  'in_review', 
  'changes_needed',
  'information_needed',
  'done'
);

-- Priority enum
CREATE TYPE public.roadmap_priority AS ENUM (
  'low', 
  'medium', 
  'high', 
  'critical'
);

-- Quarter enum for timeline planning
CREATE TYPE public.quarter AS ENUM (
  'Q1', 
  'Q2', 
  'Q3', 
  'Q4'
);
```

### Stage 2: Main Roadmap Items Table

```sql
CREATE TABLE public.roadmap_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status public.roadmap_status NOT NULL DEFAULT 'planned',
  priority public.roadmap_priority NOT NULL DEFAULT 'medium',
  quarter public.quarter,
  year INTEGER,
  effort INTEGER DEFAULT 1 CHECK (effort >= 1 AND effort <= 13),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  category TEXT,
  due_date DATE,
  notes TEXT,
  notes_updated_at TIMESTAMPTZ,
  notes_updated_by UUID REFERENCES auth.users(id),
  assigned_to UUID[] DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX idx_roadmap_items_status ON public.roadmap_items(status);
CREATE INDEX idx_roadmap_items_priority ON public.roadmap_items(priority);
CREATE INDEX idx_roadmap_items_due_date ON public.roadmap_items(due_date);
CREATE INDEX idx_roadmap_items_created_by ON public.roadmap_items(created_by);

-- RLS Policies
-- Public read access (or restrict to authenticated)
CREATE POLICY "Public read access to roadmap items"
ON public.roadmap_items FOR SELECT
USING (true);

-- Admin/moderator can create
CREATE POLICY "Admins can create roadmap items"
ON public.roadmap_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'moderator')
  )
);

-- Admin/moderator can update
CREATE POLICY "Admins can update roadmap items"
ON public.roadmap_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'moderator')
  )
);

-- Only admins can delete
CREATE POLICY "Only admins can delete roadmap items"
ON public.roadmap_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_roadmap_items_updated_at
  BEFORE UPDATE ON public.roadmap_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

### Stage 3: Attachments Table

```sql
CREATE TABLE public.attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  uploader_id UUID NOT NULL REFERENCES auth.users(id),
  roadmap_item_id UUID REFERENCES public.roadmap_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure attachment belongs to exactly one parent (extensible)
  CONSTRAINT attachments_single_parent CHECK (
    roadmap_item_id IS NOT NULL
  )
);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_attachments_roadmap_item ON public.attachments(roadmap_item_id);
CREATE INDEX idx_attachments_uploader ON public.attachments(uploader_id);

-- RLS Policies
CREATE POLICY "Public read access to attachments"
ON public.attachments FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can upload attachments"
ON public.attachments FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can delete own attachments or admins"
ON public.attachments FOR DELETE
USING (
  uploader_id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);
```

### Stage 4: Change Requests Table

```sql
CREATE TABLE public.roadmap_change_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  roadmap_item_id UUID NOT NULL REFERENCES public.roadmap_items(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'addressed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.roadmap_change_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_change_requests_item ON public.roadmap_change_requests(roadmap_item_id);
CREATE INDEX idx_change_requests_status ON public.roadmap_change_requests(status);

-- RLS Policies
CREATE POLICY "Public read access to change requests"
ON public.roadmap_change_requests FOR SELECT
USING (true);

CREATE POLICY "Admins can manage change requests"
ON public.roadmap_change_requests FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'moderator')
  )
);

CREATE TRIGGER update_change_requests_updated_at
  BEFORE UPDATE ON public.roadmap_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

### Stage 5: Dependencies Table

```sql
CREATE TABLE public.roadmap_item_dependencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  roadmap_item_id UUID NOT NULL REFERENCES public.roadmap_items(id) ON DELETE CASCADE,
  depends_on_item_id UUID NOT NULL REFERENCES public.roadmap_items(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Prevent duplicate dependencies
  CONSTRAINT unique_dependency UNIQUE (roadmap_item_id, depends_on_item_id),
  -- Prevent self-referential dependencies
  CONSTRAINT no_self_dependency CHECK (roadmap_item_id != depends_on_item_id)
);

ALTER TABLE public.roadmap_item_dependencies ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_dependencies_item ON public.roadmap_item_dependencies(roadmap_item_id);
CREATE INDEX idx_dependencies_depends_on ON public.roadmap_item_dependencies(depends_on_item_id);

-- RLS Policies
CREATE POLICY "Public read access to dependencies"
ON public.roadmap_item_dependencies FOR SELECT
USING (true);

CREATE POLICY "Admins can manage dependencies"
ON public.roadmap_item_dependencies FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'moderator')
  )
);
```

### Stage 6: Comments Table

```sql
CREATE TABLE public.roadmap_item_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  roadmap_item_id UUID NOT NULL REFERENCES public.roadmap_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  comment_text TEXT NOT NULL,
  mentions UUID[] DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.roadmap_item_comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_comments_item ON public.roadmap_item_comments(roadmap_item_id);
CREATE INDEX idx_comments_user ON public.roadmap_item_comments(user_id);

-- RLS Policies
CREATE POLICY "Authenticated users can read comments"
ON public.roadmap_item_comments FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create comments"
ON public.roadmap_item_comments FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "Users can delete own comments or admins"
ON public.roadmap_item_comments FOR DELETE
USING (
  user_id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON public.roadmap_item_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

---

## 5. Storage Configuration

### Create Storage Bucket

```sql
-- Create private bucket for roadmap attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'roadmap-attachments',
  'roadmap-attachments',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain']
);

-- Storage policies
CREATE POLICY "Authenticated users can upload to roadmap-attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'roadmap-attachments' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read own files or admins"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'roadmap-attachments' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'moderator')
    )
  )
);

CREATE POLICY "Users can delete own files or admins"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'roadmap-attachments' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  )
);
```

---

## 6. Backend (Edge Functions)

### 6.1 Send Roadmap Assignment Email

**Path**: `supabase/functions/send-roadmap-assignment-email/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RoadmapAssignmentEmailRequest {
  recipient_user_id: string;
  assigner_name: string;
  item_id: string;
  item_title: string;
  item_url: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const requestData: RoadmapAssignmentEmailRequest = await req.json();
    const { recipient_user_id, assigner_name, item_id, item_title, item_url } = requestData;

    // Skip self-assignment
    if (recipient_user_id === user.id) {
      return new Response(
        JSON.stringify({ success: true, message: "Skipped - self-assignment", email_sent: false }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Optional: Check if recipient is admin (only notify admins)
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: recipient_user_id,
      _role: 'admin'
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: true, message: "Skipped - not admin", email_sent: false }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch recipient profile
    const { data: recipientProfile } = await supabase
      .from("user_profile")
      .select("email, full_name")
      .eq("id", recipient_user_id)
      .single();

    if (!recipientProfile?.email) {
      return new Response(JSON.stringify({ error: "Recipient email not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const firstName = (recipientProfile.full_name || "there").split(' ')[0];
    const siteUrl = "https://your-domain.com"; // Configure this
    const fullItemUrl = item_url.startsWith('http') ? item_url : `${siteUrl}${item_url}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; background-color: #f4f4f5; padding: 40px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 32px;">
          <h1>New Assignment</h1>
          <p>Hi ${firstName},</p>
          <p><strong>${assigner_name}</strong> has assigned you to:</p>
          <div style="background: #f4f4f5; border-left: 4px solid #10b981; padding: 16px; margin: 16px 0;">
            <strong>"${item_title}"</strong>
          </div>
          <a href="${fullItemUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            View Roadmap Item
          </a>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: "Your App <noreply@your-domain.com>",
      to: [recipientProfile.email],
      subject: `You've been assigned to "${item_title}"`,
      html: emailHtml,
    });

    return new Response(
      JSON.stringify({ success: true, email_sent: true, resend_id: emailResponse.data?.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
```

### 6.2 Send Roadmap Mention Email

**Path**: `supabase/functions/send-roadmap-mention-email/index.ts`

Similar structure to assignment email, but for @mentions in comments. Key differences:
- Subject: `${commenter_name} mentioned you in "${item_title}"`
- Includes comment text preview
- Different color scheme (indigo vs green)

### 6.3 Transcribe Audio (Voice Input)

**Path**: `supabase/functions/transcribe-audio/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { audio } = await req.json();
    if (!audio) throw new Error('No audio data provided');

    // Decode base64 audio
    const binaryAudio = Uint8Array.from(atob(audio), c => c.charCodeAt(0));

    // Send to OpenAI Whisper
    const formData = new FormData();
    formData.append('file', new Blob([binaryAudio], { type: 'audio/webm' }), 'audio.webm');
    formData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${await response.text()}`);
    }

    const result = await response.json();
    return new Response(JSON.stringify({ text: result.text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

---

## 7. Frontend Components

### 7.1 Component Architecture

```
src/
├── components/
│   └── feedback/
│       ├── ProductRoadmap.tsx      # Main roadmap component (1400+ lines)
│       ├── MentionTextarea.tsx     # @mention input component
│       └── UserAssignmentSelector.tsx # Multi-user picker
├── pages/
│   └── Roadmap.tsx                 # Page wrapper with loading/error states
├── hooks/
│   ├── useRoadmapItems.ts          # Data fetching hook
│   ├── useRoadmapMutations.ts      # CRUD mutation hooks
│   ├── useRoadmapComments.ts       # Comments hooks
│   ├── useAdminUsers.ts            # Fetch admin users for mentions
│   └── useMediaRecorder.ts         # Voice recording hook
└── lib/
    └── status-mapping.ts           # Status/priority utilities
```

### 7.2 Type Definitions

```typescript
// src/components/feedback/ProductRoadmap.tsx

export interface RoadmapAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  path: string;
  uploadedBy: {
    name: string;
    avatar?: string;
  };
  uploadedAt: Date;
}

export interface RoadmapChangeRequest {
  id: string;
  requestedBy: {
    name: string;
    avatar?: string;
  };
  reason: string;
  details?: string;
  status: "pending" | "addressed" | "dismissed";
  createdAt: Date;
  updatedAt: Date;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: "in_planning" | "planned" | "next_sprint" | "in_progress" | 
          "in_review" | "released" | "changes_needed" | "information_needed";
  priority: "critical" | "high" | "medium" | "low";
  quarter?: "Q1" | "Q2" | "Q3" | "Q4";
  year?: number;
  effort: number;
  assignee?: { name: string; avatar?: string };
  assignedTo?: Array<{ id: string; name: string; avatar?: string }>;
  submittedBy?: { name: string; avatar?: string };
  progress: number;
  category: string;
  dueDate?: Date;
  notes?: string;
  notes_updated_at?: string;
  notes_updated_by?: string;
  createdAt: Date;
  updatedAt: Date;
  attachments?: RoadmapAttachment[];
  changeRequests?: RoadmapChangeRequest[];
  dependencies?: string[];
  dependents?: string[];
}
```

### 7.3 Main Component Features

**ProductRoadmap.tsx** includes:

1. **Header with Add Button**
2. **Search & Filter Bar** - Search, status filter, priority filter, assignment filter
3. **Tabs** - Active / Implemented / Changes Needed
4. **Item Cards** with:
   - Title, status badge, priority badge, category badge
   - Short ID (clickable to copy)
   - Due date
   - Assigned users
   - Progress bar
   - Collapsible details section
   - Comments section
   - Attachments section
   - Change requests section
   - Quick action dropdown
5. **Create/Edit Dialog** with:
   - Title, description, status, priority
   - User assignment selector
   - Progress slider
   - Category dropdown
   - Due date picker
   - Follow-up notes with voice input
   - Dependencies manager
   - File upload (drag-drop, paste, capture)
6. **Change Request Dialog**
7. **Deep Link Handling** - Scroll to and highlight item from URL param

### 7.4 Voice Input Component

```typescript
// src/components/ui/voice-input.tsx
import { useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { Button } from './button';
import { useMediaRecorder } from '@/hooks/useMediaRecorder';
import { toast } from 'sonner';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  className?: string;
}

export const VoiceInput = ({ onTranscript, className }: VoiceInputProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { isRecording, recordingTime, startRecording, stopRecording } = useMediaRecorder();

  const handleRecordClick = async () => {
    if (isRecording) {
      setIsProcessing(true);
      const transcript = await stopRecording();
      setIsProcessing(false);
      if (transcript) {
        onTranscript(transcript);
        toast.success('Transcription completed');
      }
    } else {
      await startRecording();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant={isRecording ? "destructive" : "outline"}
        size="icon"
        onClick={handleRecordClick}
        disabled={isProcessing}
      >
        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 
         isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>
      {isRecording && <span className="text-sm font-mono">{formatTime(recordingTime)}</span>}
      {isProcessing && <span className="text-sm text-muted-foreground">Transcribing...</span>}
    </div>
  );
};
```

### 7.5 Mention Textarea Component

```typescript
// src/components/feedback/MentionTextarea.tsx
// Features:
// - Detects @ character and shows user suggestions
// - Keyboard navigation (arrow keys, enter, escape)
// - Replaces @query with @Full Name
// - Tracks mentioned user IDs for notification

interface MentionTextareaProps {
  value: string;
  onChange: (text: string) => void;
  mentions: string[];
  onMentionsChange: (mentions: string[]) => void;
  placeholder?: string;
}
```

### 7.6 User Assignment Selector

```typescript
// src/components/feedback/UserAssignmentSelector.tsx
// Features:
// - Searchable command palette
// - Multi-select with checkboxes
// - Avatar display
// - Chip display for selected users
// - Remove button on chips

interface UserAssignmentSelectorProps {
  selectedUsers: Array<{ id: string; name: string; avatar?: string }>;
  onUsersChange: (users: Array<{ id: string; name: string; avatar?: string }>) => void;
}
```

---

## 8. Hooks & Data Layer

### 8.1 useRoadmapItems

```typescript
// src/hooks/useRoadmapItems.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRoadmapItems() {
  return useQuery({
    queryKey: ["roadmap_items"],
    queryFn: async (): Promise<RoadmapItem[]> => {
      // 1. Fetch roadmap items
      const { data: items, error } = await supabase
        .from("roadmap_items")
        .select("*")
        .order('created_at', { ascending: false });

      // 2. Batch fetch user profiles
      // 3. Batch fetch attachments
      // 4. Batch fetch dependencies
      // 5. Batch fetch change requests
      // 6. Map to UI format with profile lookups

      return mappedItems;
    },
  });
}
```

### 8.2 useRoadmapMutations

```typescript
// src/hooks/useRoadmapMutations.ts

// Create item
export function useCreateRoadmapItem() { ... }

// Update item (includes email notification for new assignments)
export function useUpdateRoadmapItem() { ... }

// Delete item
export function useDeleteRoadmapItem() { ... }

// Upload attachment
export function useUploadRoadmapAttachment() { ... }

// Delete attachment (from storage + database)
export function useDeleteRoadmapAttachment() { ... }

// Create change request
export function useCreateChangeRequest() { ... }

// Update change request status
export function useUpdateChangeRequestStatus() { ... }

// Add dependency
export function useAddDependency() { ... }

// Remove dependency
export function useRemoveDependency() { ... }
```

### 8.3 useRoadmapComments

```typescript
// src/hooks/useRoadmapComments.ts

export function useRoadmapComments(roadmapItemId: string | null) {
  // Fetches comments for a specific item with user profiles
}

export function useCreateRoadmapComment() {
  // Creates comment and sends notifications:
  // - In-app notification to item creator
  // - In-app + email notification to @mentioned users
}

export function useDeleteRoadmapComment() {
  // Deletes comment (own comments or admin)
}
```

### 8.4 useMediaRecorder

```typescript
// src/hooks/useMediaRecorder.ts

export function useMediaRecorder() {
  // - Requests microphone access
  // - Records audio as WebM/Opus
  // - Auto-stops after 60 seconds
  // - Sends to transcribe-audio edge function
  // - Returns transcript text

  return {
    isRecording,
    recordingTime,
    startRecording,
    stopRecording, // returns Promise<string | null>
    error
  };
}
```

---

## 9. Utility Functions

### 9.1 Status Mapping

```typescript
// src/lib/status-mapping.ts

export type RoadmapDbStatus = 
  | "backlog" | "in_planning" | "planned" | "next_sprint" 
  | "in_progress" | "in_review" | "changes_needed" 
  | "information_needed" | "done";

export type RoadmapUiStatus = 
  | "in_planning" | "planned" | "next_sprint" | "in_progress" 
  | "in_review" | "released" | "changes_needed" | "information_needed";

// DB → UI mapping
export const mapRoadmapDbToUi = (s: RoadmapDbStatus): RoadmapUiStatus => { ... };

// UI → DB mapping
export const mapRoadmapUiToDb = (s: RoadmapUiStatus): RoadmapDbStatus => { ... };

// Display labels
export const getStatusLabel = (status: RoadmapUiStatus): string => { ... };

// Badge variants
export const getStatusVariant = (status: RoadmapUiStatus) => { ... };
export const getPriorityLabel = (priority) => { ... };
export const getPriorityVariant = (priority) => { ... };
```

---

## 10. Staged Implementation Plan

### Stage 1: Database Foundation (Day 1)

1. ✅ Create enums (roadmap_status, roadmap_priority, quarter)
2. ✅ Create roadmap_items table with indexes
3. ✅ Create RLS policies for roadmap_items
4. ✅ Create timestamp trigger
5. ✅ Test basic CRUD via Supabase dashboard

### Stage 2: Basic UI (Day 1-2)

1. ✅ Create status-mapping.ts utilities
2. ✅ Create useRoadmapItems hook (basic fetch)
3. ✅ Create basic ProductRoadmap component
4. ✅ Create Roadmap page with loading/error states
5. ✅ Add route to App.tsx
6. ✅ Test list display, create, and update

### Stage 3: Attachments (Day 2)

1. ✅ Create attachments table
2. ✅ Create storage bucket with policies
3. ✅ Add useUploadRoadmapAttachment mutation
4. ✅ Add useDeleteRoadmapAttachment mutation
5. ✅ Add file upload UI (click, drag-drop, paste)
6. ✅ Add screen capture functionality
7. ✅ Test upload and display

### Stage 4: Change Requests (Day 2-3)

1. ✅ Create roadmap_change_requests table
2. ✅ Add useCreateChangeRequest mutation
3. ✅ Add useUpdateChangeRequestStatus mutation
4. ✅ Add change request dialog UI
5. ✅ Add change request display in item details
6. ✅ Test workflow: request → address/dismiss

### Stage 5: Dependencies (Day 3)

1. ✅ Create roadmap_item_dependencies table
2. ✅ Add useAddDependency mutation
3. ✅ Add useRemoveDependency mutation
4. ✅ Update useRoadmapItems to fetch dependencies
5. ✅ Add dependency selector in edit dialog
6. ✅ Add "Blocks These Items" display
7. ✅ Test dependency creation and display

### Stage 6: Comments & Mentions (Day 3-4)

1. ✅ Create roadmap_item_comments table
2. ✅ Create useAdminUsers hook
3. ✅ Create MentionTextarea component
4. ✅ Create useRoadmapComments hooks
5. ✅ Add comments section to item details
6. ✅ Add in-app notifications for mentions
7. ✅ Test commenting and @mention flow

### Stage 7: Email Notifications (Day 4)

1. ✅ Create send-roadmap-assignment-email function
2. ✅ Create send-roadmap-mention-email function
3. ✅ Add RESEND_API_KEY secret
4. ✅ Update mutations to call email functions
5. ✅ Test email delivery

### Stage 8: Voice Input (Day 4-5)

1. ✅ Create transcribe-audio edge function
2. ✅ Add OPENAI_API_KEY secret
3. ✅ Create useMediaRecorder hook
4. ✅ Create VoiceInput component
5. ✅ Add voice input to description and notes fields
6. ✅ Test recording and transcription

### Stage 9: Polish & Deep Linking (Day 5)

1. ✅ Add search and filter functionality
2. ✅ Add tabs (Active/Implemented/Changes)
3. ✅ Add deep link handling (?item=xxx)
4. ✅ Add ID copying to clipboard
5. ✅ Add user assignment selector
6. ✅ Add assignment filter by specific users
7. ✅ Final testing and bug fixes

---

## 11. Testing Checklist

### Database Tests
- [ ] Roadmap items CRUD operations work
- [ ] RLS policies enforce correct permissions
- [ ] Cascade deletes work for attachments/comments
- [ ] Constraint prevents self-referential dependencies
- [ ] Storage bucket policies work correctly

### Functionality Tests
- [ ] Create roadmap item with all fields
- [ ] Update roadmap item (all fields)
- [ ] Delete roadmap item
- [ ] Upload image attachment
- [ ] Upload document attachment
- [ ] Delete attachment
- [ ] Capture screenshot
- [ ] Paste screenshot from clipboard
- [ ] Create change request
- [ ] Mark change request as addressed/dismissed
- [ ] Add comment
- [ ] @mention user in comment
- [ ] Add dependency between items
- [ ] Remove dependency
- [ ] Voice input transcription
- [ ] Search items
- [ ] Filter by status
- [ ] Filter by priority
- [ ] Filter by assignment
- [ ] Copy short ID to clipboard
- [ ] Deep link navigates and highlights item

### Notification Tests
- [ ] Assignment triggers in-app notification
- [ ] Assignment triggers email (to admins only)
- [ ] @mention triggers in-app notification
- [ ] @mention triggers email (to admins only)

### Edge Cases
- [ ] Upload file larger than 10MB (should fail gracefully)
- [ ] Upload unsupported file type
- [ ] Delete item with attachments (should cascade)
- [ ] Multiple change requests on same item
- [ ] Empty roadmap list display
- [ ] Network error during upload
- [ ] Self-assignment (should skip notification)

---

## 12. Advanced Customizations

### Custom Status Workflow

To modify the status workflow, update:
1. `roadmap_status` enum in database
2. `RoadmapDbStatus` and `RoadmapUiStatus` types in `status-mapping.ts`
3. `mapRoadmapDbToUi` and `mapRoadmapUiToDb` functions
4. `getStatusLabel` and `getStatusVariant` functions
5. Status filter options in ProductRoadmap
6. Quick action dropdown items

### Custom Categories

Categories are currently free-text with predefined options. To enforce categories:
1. Create a `roadmap_categories` table
2. Add foreign key to `roadmap_items`
3. Create a category management UI

### Custom Notification Rules

Current notifications go only to admins. To customize:
1. Modify `has_role` check in edge functions
2. Add notification preferences table
3. Check user preferences before sending

### Kanban Board View

To add drag-and-drop Kanban:
1. Install `@dnd-kit/core` and `@dnd-kit/sortable`
2. Create `KanbanBoard` component
3. Group items by status columns
4. Handle drag events to update status

### Activity Timeline

To track all changes:
1. Create `roadmap_item_activity` table
2. Add database trigger on `roadmap_items` changes
3. Create activity log component
4. Display timeline in item details

---

## Summary

This guide provides everything needed to replicate a production-ready product roadmap system. The staged implementation plan allows for incremental development with testable milestones at each stage.

Key architectural decisions:
- **React Query** for data fetching and cache invalidation
- **Supabase** for database, auth, storage, and edge functions
- **RLS policies** for security
- **Batch fetching** for performance (profiles, attachments, etc.)
- **Edge functions** for email and transcription (keeps API keys secure)
- **Component composition** for maintainability

For questions or enhancements, refer to the original implementation files in this repository.
