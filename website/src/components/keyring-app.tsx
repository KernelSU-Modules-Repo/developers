"use client";

import { useState, useEffect } from "react";
import * as openpgp from "openpgp";
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

// ... (Zod Schemas 保持不变) ...
const genSchema = z.object({
  name: z.string().min(2, "Name is too short"),
  email: z.string().email("Invalid email address"),
});

const submitSchema = z.object({
  username: z.string().min(1, "Username required"),
  publicKey: z.string().includes("BEGIN PGP PUBLIC KEY BLOCK", { message: "Invalid PGP Key" }),
});

const revokeSchema = z.object({
  username: z.string().min(1),
  fingerprint: z.string().min(10),
  reason: z.string(),
  details: z.string().optional(),
});

// --- 通用工具函数 ---

// 下载文件工具
const downloadKey = (content: string, filename: string) => {
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

// 文件导入处理工具 (返回 Fingerprint 和 Full Text)
const parseKeyFile = async (file: File): Promise<{ fingerprint: string, text: string } | null> => {
  try {
    const text = await file.text();
    // 尝试解析 PGP 密钥
    const key = await openpgp.readKey({ armoredKey: text }).catch(() => null);
    if (!key) throw new Error("Invalid Key");
    return {
      fingerprint: key.getFingerprint(),
      text: text
    };
  } catch (e) {
    console.error(e);
    return null;
  }
};

export function KeyringApp() {
  // ... (Main Layout 保持不变) ...
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
        <p>Powered by OpenPGP.js • Secure & Client-side Only</p>
      </footer>
    </div>
  );
}

// --- Sub Components (更新后的组件) ---

function GenerateForm({ t }: { t: typeof locales.en }) {
  const [keys, setKeys] = useState<{ priv: string; pub: string; fp: string; name: string } | null>(null);
  const form = useForm<z.infer<typeof genSchema>>({ resolver: zodResolver(genSchema) });
  const [loading, setLoading] = useState(false);

  const onSubmit = async (data: z.infer<typeof genSchema>) => {
    setLoading(true);
    try {
      const { privateKey, publicKey } = await openpgp.generateKey({
        type: "ecc", curve: "secp256k1", userIDs: [{ name: data.name, email: data.email }], format: "armored"
      });
      const key = await openpgp.readKey({ armoredKey: publicKey });
      setKeys({ priv: privateKey, pub: publicKey, fp: key.getFingerprint(), name: data.name.replace(/\s+/g, '_') });
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
               <code className="text-lg md:text-xl font-mono font-bold text-indigo-600 break-all">
                 {keys.fp}
               </code>
               <Button
                 variant="ghost"
                 size="icon"
                 className="shrink-0 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-slate-800"
                 onClick={() => {
                   navigator.clipboard.writeText(keys.fp);
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
              content={keys.priv} 
              isSecret 
              downloadName={`${keys.name}_private.asc`}
              downloadText={t.gen.download_priv}
            />
            <KeyDisplay 
              title={t.gen.pub_label} 
              content={keys.pub} 
              downloadName={`${keys.name}_public.asc`}
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
    
    const result = await parseKeyFile(file);
    if (result) {
      // 提交需要填入公钥文本
      form.setValue("publicKey", result.text);
      toast.success(t.common.import_success);
    } else {
      toast.error(t.common.import_error);
    }
    e.target.value = ""; // reset input
  };

  const onSubmit = (data: z.infer<typeof submitSchema>) => {
    const title = `[keyring] ${data.username}`;
    const body = `## Submit Developer Public Key\n\n**Public Key**:\n\n\`\`\`\n${data.publicKey}\n\`\`\`\n\n---\nPlease review and add \`approved\` label.`;
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
          {/* 文件导入按钮 */}
          <div className="flex items-center gap-2">
            <Label htmlFor="import-submit" className="cursor-pointer text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 transition-colors">
              <Upload className="w-3 h-3" /> {t.common.import_file}
            </Label>
            <Input id="import-submit" type="file" className="hidden" accept=".asc,.gpg,.txt" onChange={handleFileImport} />
          </div>
        </div>
        <Textarea {...form.register("publicKey")} className="font-mono text-xs h-32" placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----" />
        {form.formState.errors.publicKey && <p className="text-xs text-red-500">{form.formState.errors.publicKey.message}</p>}
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
  id: string;
  fp: string;
  created: string;
  selfSigned: boolean;
  coreSigned: boolean;
}

function QueryForm({ t }: { t: typeof locales.en }) {
  const [fp, setFp] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);

  // 导入逻辑：提取指纹
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const result = await parseKeyFile(file);
    if (result) {
      setFp(result.fingerprint); // 自动填入指纹
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
      const res = await fetch("https://raw.githubusercontent.com/KernelSU-Modules-Repo/developers/main/keyring/developers.pgp");
      if (!res.ok) throw new Error("Failed to fetch keyring");
      const text = await res.text();
      const keys = await openpgp.readKeys({ armoredKeys: text });
      // 支持带空格的指纹查询
      const cleanFp = fp.replace(/\s/g, "").toUpperCase();
      const found = keys.find(k => k.getFingerprint().toUpperCase().includes(cleanFp));
      
      if (found) {
        const user = found.users[0];
        const userId = user.userID?.userID;
        if (!userId) {
          toast.error("Invalid user ID");
          return;
        }
        setResult({
          id: userId,
          fp: found.getFingerprint(),
          created: found.getCreationTime().toLocaleDateString(),
          selfSigned: user.selfCertifications.length > 0,
          coreSigned: user.otherCertifications.length > 0
        });
        toast.success(t.query.found);
      } else {
        toast.error(t.query.not_found);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
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
             <Label htmlFor="import-query" className="cursor-pointer text-xs flex items-center gap-1 text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded">
               <FileKey className="w-3 h-3" /> {t.common.import_file}
             </Label>
             <Input id="import-query" type="file" className="hidden" onChange={handleFileImport} />
          </div>
        </div>
        <div className="flex gap-2">
          <Input value={fp} onChange={e => setFp(e.target.value)} placeholder="ABCD 1234..." className="font-mono" />
          <Button onClick={handleQuery} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {result && (
        <Card className="bg-slate-50 dark:bg-slate-900">
          <CardContent className="p-4 space-y-3 text-sm">
             <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">User ID</span>
                <span className="font-medium">{result.id}</span>
             </div>
             {/* ... 结果显示部分保持不变 ... */}
             <div className="pt-2">
                <span className="text-slate-500 block mb-1">Fingerprint</span>
                <code className="block bg-slate-200 dark:bg-slate-800 p-2 rounded text-xs break-all">{result.fp}</code>
             </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RevokeForm({ t }: { t: typeof locales.en }) {
  const form = useForm<z.infer<typeof revokeSchema>>({ resolver: zodResolver(revokeSchema) });

  // 导入逻辑：提取指纹
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const result = await parseKeyFile(file);
    if (result) {
      form.setValue("fingerprint", result.fingerprint);
      toast.success(t.common.import_success);
    } else {
      toast.error(t.common.import_error);
    }
    e.target.value = "";
  };

  const onSubmit = (data: z.infer<typeof revokeSchema>) => {
    const title = `[revoke] ${data.fingerprint.substring(0, 16)}...`;
    const body = `## Revoke Developer Key\n\n**Requested by**: @${data.username}\n**Key**: \`${data.fingerprint}\`\n**Reason**: ${data.reason}\n\n**Details**:\n${data.details || "N/A"}`;
    window.open(`https://github.com/KernelSU-Modules-Repo/developers/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, "_blank");
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <div>
        <h2 className="text-lg font-semibold text-red-600">{t.revoke.title}</h2>
        <p className="text-sm text-slate-500">{t.revoke.desc}</p>
      </div>
      
      {/* ... 用户名和原因部分保持不变 ... */}
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
             <Input id="import-revoke" type="file" className="hidden" onChange={handleFileImport} />
          </div>
        </div>
        <Input {...form.register("fingerprint")} className="font-mono" placeholder="Full Fingerprint" />
      </div>

      {/* ... Details Textarea 保持不变 ... */}
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

// UI Helper: Key Display with Download & Copy
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
              onClick={() => downloadKey(content, downloadName)} 
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