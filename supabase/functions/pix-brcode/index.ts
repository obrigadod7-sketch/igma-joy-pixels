// Generate a PIX "Copia e Cola" BR Code (EMVCo) with CRC16-CCITT
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PIX_KEY = Deno.env.get("PIX_KEY") ?? "watizat@exemplo.com";
const MERCHANT_NAME = (Deno.env.get("PIX_MERCHANT") ?? "WATIZAT JATAI").toUpperCase().slice(0, 25);
const MERCHANT_CITY = (Deno.env.get("PIX_CITY") ?? "JATAI").toUpperCase().slice(0, 15);
// Server-enforced amount; never trust client-provided value.
const FIXED_AMOUNT = Number(Deno.env.get("SUB_AMOUNT") ?? "35.90");

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function buildBrcode(opts: { key: string; amount: number; txid: string }) {
  const mai = tlv("00", "br.gov.bcb.pix") + tlv("01", opts.key);
  const addData = tlv("05", opts.txid.slice(0, 25));
  const payloadNoCrc =
    tlv("00", "01") +
    tlv("26", mai) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", opts.amount.toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", MERCHANT_NAME) +
    tlv("60", MERCHANT_CITY) +
    tlv("62", addData) +
    "6304";
  return payloadNoCrc + crc16(payloadNoCrc);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const value = FIXED_AMOUNT;
    const txid = `WTZ${Date.now()}`.slice(0, 25);
    const brcode = buildBrcode({ key: PIX_KEY, amount: value, txid });

    return new Response(
      JSON.stringify({ brcode, txid, amount: value, merchant: MERCHANT_NAME, key: PIX_KEY }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
