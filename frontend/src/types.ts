export interface Stage {
  name: string
  duration: string
}

export interface ServiceFields {
  name: string
  category: string
  keywords: string
  table_group: string
  description: string
  duration_label: string
  duration_text: string
  price: string | null
  price_text: string
  price_unit: string
  price_note: string
  section_title: string
  intro_text: string
  price_header: string
  stages_title: string
  stages_name_header: string
  stages_duration_header: string
  footnotes: string
  extra_text: string
  active: boolean
}

export interface Service extends ServiceFields {
  id: number
  stages: (Stage & { id?: number; position?: number })[]
  updated_at?: string | null
}

export interface ServiceShort {
  id: number
  name: string
  category: string
  price: string | null
  price_text: string
  price_unit: string
  stages_count: number
  active: boolean
  updated_at?: string | null
}

export interface ProposalItem {
  service_id: number | null
  name: string
  table_group: string
  description: string
  duration_label: string
  duration_text: string
  price: string | null
  price_text: string
  price_unit: string
  price_note: string
  show_stages: boolean
  stages_title: string
  stages_name_header: string
  stages_duration_header: string
  stages: Stage[]
}

export interface ProposalData {
  company: string
  director_full: string
  director_position: string
  recipient_position: string
  director_short: string
  greeting: string
  intro_text: string
  section_title: string
  price_header: string
  validity: string
  footnotes: string
  extra_text: string
  items: ProposalItem[]
}

export interface ProposalOut {
  id: number
  number: number
  company: string
  director_full: string
  services_summary: string
  author: string
  created_at: string
}

export interface User {
  id: number
  username: string
  full_name: string
  is_admin: boolean
}

export interface Meta {
  price_units: string[]
  categories: string[]
  table_groups: string[]
  defaults: Record<string, string>
}
