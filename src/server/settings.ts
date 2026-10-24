import type { Sql } from "./db";
import type { Currency } from "@/lib/constants";

export type Settings = {
  restaurant_name: string;
  address: string;
  phone: string;
  whatsapp_number: string;
  hours_text: string;
  currency: Currency | null;
  orders_paused: boolean;
  pause_message: string | null;
  proposal_ttl_hours: number;
  payment_ttl_minutes: number;
};

export async function getSettings(sql: Sql): Promise<Settings> {
  const [s] = await sql<Settings[]>`select restaurant_name, address, phone, whatsapp_number, hours_text, currency,
    orders_paused, pause_message, proposal_ttl_hours, payment_ttl_minutes from settings where id = 1`;
  return s;
}
