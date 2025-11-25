"use client";

import { useState, useEffect } from "react";
import * as forge from "node-forge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  Copy, Loader2, ShieldCheck, AlertTriangle, Search, Key,
  Github, Globe, Download, Upload, FileKey
} from "lucide-react";

import { locales, LocaleKey } from "@/lib/locales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Zod Schemas
const genSchema = z.object({
  name: z.string().min(2, "Name is too short"),
  email: z.string().email("Invalid email address"),
});

const submitSchema = z.object({
  username: z.string().min(1, "Username required"),
  csr: z.string().includes("BEGIN CERTIFICATE REQUEST", { message: "Invalid CSR" }),
});

const revokeSchema = z.object({
  username: z.string().min(1),
  fingerprint: z.string().min(10),
  reason: z.string(),
  details: z.string().optional(),
});

// --- Utility Functions ---

// Download file utility
const downloadFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Calculate certificate fingerprint (SHA-256)
const getCertificateFingerprint = (cert: forge.pki.Certificate): string => {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  const digest = md.digest().toHex();
  return digest.toUpperCase().match(/.{2}/g)?.join(':') || '';
};

// Parse certificate file and extract fingerprint
const parseCertFile = async (file: File): Promise<{ fingerprint: string, text: string, cn?: string } | null> => {
  try {
    const text = await file.text();

    // Try to parse as certificate
    if (text.includes('BEGIN CERTIFICATE')) {
      const cert = forge.pki.certificateFromPem(text);
      const cn = cert.subject.getField('CN')?.value as string;
      return {
        fingerprint: getCertificateFingerprint(cert),
        text: text,
        cn
      };
    }

    // Try to parse as CSR
    if (text.includes('BEGIN CERTIFICATE REQUEST')) {
      return {
        fingerprint: '',
        text: text
      };
    }

    throw new Error("Invalid file format");
  } catch (e) {
    console.error(e);
    return null;
  }
};

export function KeyringApp() {
  const [lang, setLang] = useState<LocaleKey>("en");
  const t = locales[lang];

  useEffect(() => {
    const defaultLang = navigator.language.startsWith("zh") ? "zh" : "en";
    setLang(defaultLang);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 flex flex-col items-center font-sans text-slate-900 dark:text-slate-100">
      {/* Header */}
      <div className="max-w-4xl w-full flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t.subtitle}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLang(lang === "en" ? "zh" : "en")}>
          <Globe className="w-4 h-4 mr-2" />
          {lang === "en" ? "中文" : "English"}
        </Button>
      </div>

      {/* Main Content */}
      <Card className="max-w-4xl w-full shadow-xl border-slate-200 dark:border-slate-800">
        <Tabs defaultValue="generate" className="w-full">
          <div className="border-b px-6 py-2 bg-slate-50/50 dark:bg-slate-900/50">
            <TabsList className="grid w-full grid-cols-4 bg-slate-200/50 dark:bg-slate-800/50">
              <TabsTrigger value="generate">{t.tabs.generate}</TabsTrigger>
              <TabsTrigger value="submit">{t.tabs.submit}</TabsTrigger>
              <TabsTrigger value="query">{t.tabs.query}</TabsTrigger>
              <TabsTrigger value="revoke">{t.tabs.revoke}</TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6">
            <TabsContent value="generate"><GenerateForm t={t} /></TabsContent>
            <TabsContent value="submit"><SubmitForm t={t} /></TabsContent>
            <TabsContent value="query"><QueryForm t={t} /></TabsContent>
            <TabsContent value="revoke"><RevokeForm t={t} /></TabsContent>
          </div>
        </Tabs>
      </Card>

      <footer className="mt-12 text-center text-sm text-slate-400">
        <p>Powered by node-forge X.509 • Secure & Client-side Only</p>
      </footer>
    </div>
  );
}

// --- Sub Components ---

function GenerateForm({ t }: { t: typeof locales.en }) {
  const [keys, setKeys] = useState<{
    privateKey: string;
    csr: string;
    fingerprint: string;
    name: string
  } | null>(null);
  const form = useForm<z.infer<typeof genSchema>>({ resolver: zodResolver(genSchema) });
  const [loading, setLoading] = useState(false);

  const onSubmit = async (data: z.infer<typeof genSchema>) => {
    setLoading(true);
    try {
      // Generate RSA key pair (2048 bits for compatibility)
      const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048, workers: -1 });

      // Create CSR
      const csr = forge.pki.createCertificationRequest();
      csr.publicKey = keypair.publicKey;
      csr.setSubject([
        { name: 'commonName', value: data.name },
        { name: 'emailAddress', value: data.email },
        { name: 'organizationName', value: 'KernelSU Module Developers' }
      ]);

      // Sign CSR with private key
      csr.sign(keypair.privateKey, forge.md.sha256.create());

      // Convert to PEM format
      const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
      const csrPem = forge.pki.certificationRequestToPem(csr);

      // Generate a fingerprint from public key for identification
      const publicKeyDer = forge.asn1.toDer(forge.pki.publicKeyToAsn1(keypair.publicKey)).getBytes();
      const md = forge.md.sha256.create();
      md.update(publicKeyDer);
      const fingerprint = md.digest().toHex().toUpperCase();

      setKeys({
        privateKey: privateKeyPem,
        csr: csrPem,
        fingerprint,
        name: data.name.replace(/\s+/g, '_')
      });
      toast.success(t.gen.success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <div>
        <h2 className="text-lg font-semibold">{t.gen.title}</h2>
        <p className="text-sm text-slate-500">{t.gen.desc}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>{t.gen.name}</Label>
          <Input {...form.register("name")} placeholder="Linus Torvalds" />
          {form.formState.errors.name && <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>{t.gen.email}</Label>
          <Input {...form.register("email")} placeholder="linus@kernel.org" />
          {form.formState.errors.email && <p className="text-xs text-red-500">{form.formState.errors.email.message}</p>}
        </div>
      </div>

      <Button onClick={form.handleSubmit(onSubmit)} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
        {loading ? t.common.loading : t.gen.btn}
      </Button>

      {keys && (
        <div className="space-y-6 mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-2 text-center">
             <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
               {t.gen.fingerprint_label}
             </span>

             <div className="flex items-center justify-center gap-3 w-full max-w-full">
               <code className="text-sm md:text-base font-mono font-bold text-indigo-600 break-all">
                 {keys.fingerprint.match(/.{2}/g)?.join(':')}
               </code>
               <Button
                 variant="ghost"
                 size="icon"
                 className="shrink-0 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-slate-800"
                 onClick={() => {
                   navigator.clipboard.writeText(keys.fingerprint);
                   toast.success(t.common.copied);
                 }}
                 title={t.common.copy}
               >
                 <Copy className="w-4 h-4" />
               </Button>
             </div>
          </div>

          <div className="grid gap-6">
            <KeyDisplay
              title={t.gen.priv_warn}
              content={keys.privateKey}
              isSecret
              downloadName={`${keys.name}.key.pem`}
              downloadText={t.gen.download_priv}
            />
            <KeyDisplay
              title={t.gen.pub_label}
              content={keys.csr}
              downloadName={`${keys.name}.csr.pem`}
              downloadText={t.gen.download_pub}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SubmitForm({ t }: { t: typeof locales.en }) {
  const form = useForm<z.infer<typeof submitSchema>>({ resolver: zodResolver(submitSchema) });

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await parseCertFile(file);
    if (result && result.text.includes('BEGIN CERTIFICATE REQUEST')) {
      form.setValue("csr", result.text);
      toast.success(t.common.import_success);
    } else {
      toast.error(t.common.import_error);
    }
    e.target.value = "";
  };

  const onSubmit = (data: z.infer<typeof submitSchema>) => {
    const title = `[keyring] ${data.username}`;
    const body = `## Submit Developer CSR (Certificate Signing Request)\n\n**CSR**:\n\n\`\`\`\n${data.csr}\n\`\`\`\n\n---\nPlease review and add \`approved\` label to issue certificate.`;
    window.open(`https://github.com/KernelSU-Modules-Repo/developers/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, "_blank");
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <div>
        <h2 className="text-lg font-semibold">{t.sub.title}</h2>
        <p className="text-sm text-slate-500">{t.sub.desc}</p>
      </div>

      <div className="space-y-2">
        <Label>{t.sub.gh}</Label>
        <div className="relative">
          <span className="absolute left-3 top-2.5 text-slate-400 text-sm">@</span>
          <Input {...form.register("username")} className="pl-7" placeholder="username" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label>{t.sub.pub}</Label>
          <div className="flex items-center gap-2">
            <Label htmlFor="import-submit" className="cursor-pointer text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 transition-colors">
              <Upload className="w-3 h-3" /> {t.common.import_file}
            </Label>
            <Input id="import-submit" type="file" className="hidden" accept=".pem,.csr,.txt" onChange={handleFileImport} />
          </div>
        </div>
        <Textarea {...form.register("csr")} className="font-mono text-xs h-32" placeholder="-----BEGIN CERTIFICATE REQUEST-----" />
        {form.formState.errors.csr && <p className="text-xs text-red-500">{form.formState.errors.csr.message}</p>}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">{t.sub.warn}</p>
      </div>

      <Button onClick={form.handleSubmit(onSubmit)} className="w-full">
        <Github className="w-4 h-4 mr-2" /> {t.sub.btn}
      </Button>
    </div>
  );
}

interface QueryResult {
  cn: string;
  fingerprint: string;
  serialNumber: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  isValid: boolean;
}

function QueryForm({ t }: { t: typeof locales.en }) {
  const [fp, setFp] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await parseCertFile(file);
    if (result && result.fingerprint) {
      setFp(result.fingerprint);
      toast.success(t.common.import_success);
    } else {
      toast.error(t.common.import_error);
    }
    e.target.value = "";
  };

  const handleQuery = async () => {
    if (!fp) return toast.error("Please enter fingerprint");
    setLoading(true);
    setResult(null);
    try {
      // Fetch certificate bundle from repository
      const res = await fetch("https://raw.githubusercontent.com/KernelSU-Modules-Repo/developers/main/keyring/developers/");
      if (!res.ok) throw new Error("Failed to fetch certificate list");

      // For now, we'll provide a direct certificate lookup interface
      // The actual implementation would iterate through available certificates
      const cleanFp = fp.replace(/[:\s]/g, "").toUpperCase();

      // Placeholder: In production, this would fetch and search actual certificates
      toast.error(t.query.not_found + " (Certificate directory not yet configured)");

    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // Direct certificate verification from file
  const handleVerifyCert = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const cert = forge.pki.certificateFromPem(text);

      const cn = cert.subject.getField('CN')?.value as string || 'Unknown';
      const issuerCN = cert.issuer.getField('CN')?.value as string || 'Unknown';
      const now = new Date();

      setResult({
        cn,
        fingerprint: getCertificateFingerprint(cert),
        serialNumber: cert.serialNumber,
        issuer: issuerCN,
        validFrom: cert.validity.notBefore.toLocaleDateString(),
        validTo: cert.validity.notAfter.toLocaleDateString(),
        isValid: now >= cert.validity.notBefore && now <= cert.validity.notAfter
      });
      toast.success(t.query.found);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
    e.target.value = "";
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
       <div>
        <h2 className="text-lg font-semibold">{t.query.title}</h2>
        <p className="text-sm text-slate-500">{t.query.desc}</p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <Label>{t.query.ph}</Label>
          <div className="flex items-center gap-2">
             <Label htmlFor="verify-cert" className="cursor-pointer text-xs flex items-center gap-1 text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded">
               <FileKey className="w-3 h-3" /> {t.common.import_file}
             </Label>
             <Input id="verify-cert" type="file" className="hidden" accept=".pem,.cert,.crt" onChange={handleVerifyCert} />
          </div>
        </div>
        <div className="flex gap-2">
          <Input value={fp} onChange={e => setFp(e.target.value)} placeholder="AA:BB:CC:DD..." className="font-mono" />
          <Button onClick={handleQuery} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {result && (
        <Card className="bg-slate-50 dark:bg-slate-900">
          <CardContent className="p-4 space-y-3 text-sm">
             <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">Common Name (CN)</span>
                <span className="font-medium">{result.cn}</span>
             </div>
             <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">Serial Number</span>
                <span className="font-mono text-xs">{result.serialNumber}</span>
             </div>
             <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">Issuer</span>
                <span className="font-medium">{result.issuer}</span>
             </div>
             <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">Valid From</span>
                <span>{result.validFrom}</span>
             </div>
             <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">Valid To</span>
                <span>{result.validTo}</span>
             </div>
             <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">Status</span>
                <span className={result.isValid ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                  {result.isValid ? "Valid ✓" : "Expired ✗"}
                </span>
             </div>
             <div className="pt-2">
                <span className="text-slate-500 block mb-1">Fingerprint (SHA-256)</span>
                <code className="block bg-slate-200 dark:bg-slate-800 p-2 rounded text-xs break-all">{result.fingerprint}</code>
             </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RevokeForm({ t }: { t: typeof locales.en }) {
  const form = useForm<z.infer<typeof revokeSchema>>({ resolver: zodResolver(revokeSchema) });

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await parseCertFile(file);
    if (result && result.fingerprint) {
      form.setValue("fingerprint", result.fingerprint);
      toast.success(t.common.import_success);
    } else {
      toast.error(t.common.import_error);
    }
    e.target.value = "";
  };

  const onSubmit = (data: z.infer<typeof revokeSchema>) => {
    const title = `[revoke] ${data.fingerprint.substring(0, 20)}...`;
    const body = `## Revoke Developer Certificate\n\n**Requested by**: @${data.username}\n**Certificate Fingerprint**: \`${data.fingerprint}\`\n**Reason**: ${data.reason}\n\n**Details**:\n${data.details || "N/A"}`;
    window.open(`https://github.com/KernelSU-Modules-Repo/developers/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, "_blank");
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <div>
        <h2 className="text-lg font-semibold text-red-600">{t.revoke.title}</h2>
        <p className="text-sm text-slate-500">{t.revoke.desc}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>{t.sub.gh}</Label>
          <Input {...form.register("username")} placeholder="username" />
        </div>
        <div className="space-y-2">
          <Label>{t.revoke.reason}</Label>
          <Select onValueChange={v => form.setValue("reason", v)}>
            <SelectTrigger><SelectValue placeholder={t.revoke.reason} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Compromised">{t.revoke.reasons.compromised}</SelectItem>
              <SelectItem value="Lost">{t.revoke.reasons.lost}</SelectItem>
              <SelectItem value="Superseded">{t.revoke.reasons.superseded}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <Label>{t.query.ph}</Label>
          <div className="flex items-center gap-2">
             <Label htmlFor="import-revoke" className="cursor-pointer text-xs flex items-center gap-1 text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded">
               <FileKey className="w-3 h-3" /> {t.common.import_file}
             </Label>
             <Input id="import-revoke" type="file" className="hidden" accept=".pem,.cert,.crt" onChange={handleFileImport} />
          </div>
        </div>
        <Input {...form.register("fingerprint")} className="font-mono" placeholder="Certificate Fingerprint (SHA-256)" />
      </div>

      <div className="space-y-2">
        <Label>{t.revoke.details}</Label>
        <Textarea {...form.register("details")} placeholder="Optional details..." />
      </div>

      <Button onClick={form.handleSubmit(onSubmit)} variant="destructive" className="w-full">
        <Github className="w-4 h-4 mr-2" />
        {t.revoke.btn}
      </Button>
    </div>
  );
}

// UI Helper: Key/Certificate Display with Download & Copy
function KeyDisplay({
  title, content, isSecret, downloadName, downloadText
}: {
  title: string; content: string; isSecret?: boolean; downloadName?: string; downloadText?: string
}) {
  return (
    <div className={`rounded-md border overflow-hidden ${isSecret ? "border-red-200 bg-red-50 dark:bg-red-900/10" : "border-slate-200 bg-slate-50 dark:bg-slate-900"}`}>
      <div className={`px-3 py-2 flex justify-between items-center text-xs font-medium border-b ${isSecret ? "bg-red-100/50 text-red-700 dark:text-red-400 dark:border-red-900/30" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
        <span>{title}</span>
        <div className="flex gap-2">
          {downloadName && (
            <button
              onClick={() => downloadFile(content, downloadName)}
              className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              title={downloadText}
            >
              <Download className="w-3.5 h-3.5" /> {downloadText && <span className="hidden sm:inline">{downloadText}</span>}
            </button>
          )}
          <div className="w-px bg-slate-300 dark:bg-slate-700 h-3 my-auto"></div>
          <button
            onClick={() => { navigator.clipboard.writeText(content); toast.success("Copied!") }}
            className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Copy</span>
          </button>
        </div>
      </div>
      <div className="p-3 overflow-x-auto">
        <pre className={`text-[10px] leading-relaxed font-mono ${isSecret ? "text-red-800 dark:text-red-300" : "text-slate-600 dark:text-slate-400"}`}>
          {content}
        </pre>
      </div>
    </div>
  );
}
