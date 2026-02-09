"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { updateCenter, createCenter, type CreateCenterData, type UpdateCenterData } from "@/lib/api/centers";
import type { Center } from "@/lib/api/centers";
import { toUserFriendlyMessage } from "@/lib/utils/api-error";
import { toast } from "sonner";
import { Building2, Upload, X, Image as ImageIcon } from "lucide-react";
import { getAllUsers } from "@/lib/api/auth";
import type { User } from "@/lib/types";

const TECHNICAL_DETAILS_OPTIONS = [
  { id: "ses-sistemi", label: "Ses Sistemi" },
  { id: "isiklandirma", label: "Işıklandırma" },
  { id: "projeksiyon", label: "Projeksiyon/Perde" },
  { id: "mikrofon", label: "Mikrofon" },
  { id: "muzik-sistemi", label: "Müzik Sistemi" },
  { id: "wifi", label: "WiFi İnternet" },
  { id: "klima", label: "Klima" },
  { id: "park-yeri", label: "Park Yeri" },
  { id: "asansor", label: "Asansör" },
  { id: "engelli-erisim", label: "Engelli Erişimi" },
  { id: "mutfak", label: "Mutfak" },
  { id: "bufe-alani", label: "Büfe Alanı" },
  { id: "dans-pisti", label: "Dans Pisti" },
  { id: "dekorasyon", label: "Dekorasyon Hizmeti" },
  { id: "güvenlik", label: "Güvenlik" },
  { id: "temizlik", label: "Temizlik Hizmeti" },
  { id: "ses-yalitimi", label: "Ses Yalıtımı" },
  { id: "hazirlik-odasi", label: "Hazırlık Odası" },
  { id: "vestiyer", label: "Vestiyer" },
  { id: "tuvalet", label: "Tuvalet" },
];

function parseTechnicalDetails(details: string): Set<string> {
  if (!details) return new Set();
  const foundIds = new Set<string>();
  const items = details.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  items.forEach((item) => {
    const option = TECHNICAL_DETAILS_OPTIONS.find(
      (opt) => opt.label.toLowerCase() === item.toLowerCase() || opt.id === item
    );
    if (option) foundIds.add(option.id);
  });
  return foundIds;
}

function formatTechnicalDetails(selected: Set<string>): string {
  const labels = Array.from(selected)
    .map((id) => {
      const option = TECHNICAL_DETAILS_OPTIONS.find((opt) => opt.id === id);
      return option ? option.label : id;
    })
    .filter(Boolean);
  return labels.join(", ");
}

function getDepartmentName(department?: number): string {
  switch (department) {
    case 0:
      return "Nikah";
    case 1:
      return "Nişan";
    case 2:
      return "Konser";
    case 3:
      return "Toplantı";
    case 4:
      return "Özel";
    default:
      return "Belirtilmemiş";
  }
}

type Mode = "create" | "update";

interface CenterFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  initialCenter?: Center | null;
  onSuccess: (center: Center) => void | Promise<void>;
}

const emptyForm: CreateCenterData = {
  name: "",
  address: "",
  description: "",
  imageUrl: "",
};

export function CenterFormModal({
  open,
  onOpenChange,
  mode,
  initialCenter,
  onSuccess,
}: CenterFormModalProps) {
  const [form, setForm] = useState<CreateCenterData & { capacity: number; technicalDetails: string; allowedUserIds: string[] }>({
    ...emptyForm,
    capacity: 0,
    technicalDetails: "",
    allowedUserIds: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [selectedTechnicalDetails, setSelectedTechnicalDetails] = useState<Set<string>>(new Set());
  const [selectedEditorIds, setSelectedEditorIds] = useState<Set<string>>(new Set());
  const [selectedMerkezSorumlusuIds, setSelectedMerkezSorumlusuIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editors, setEditors] = useState<User[]>([]);
  const [merkezSorumlulari, setMerkezSorumlulari] = useState<User[]>([]);

  useEffect(() => {
    if (open) {
      getAllUsers()
        .then((users) => {
          setEditors(users.filter((u) => u.role === "Editor"));
          setMerkezSorumlulari(users.filter((u) => u.role === "MerkezSorumlusu"));
        })
        .catch(() => {
          setEditors([]);
          setMerkezSorumlulari([]);
        });
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      if (mode === "update" && initialCenter) {
        // Kapasite ve teknik detayları description'dan parse et
        let capacity = 0;
        let description = initialCenter.description || "";
        let technicalDetails = "";
        let allowedUserIds: string[] = [];
        let merkezSorumlusuIds: string[] = [];
        
        const capacityMatch = description.match(/Toplam Kapasite:\s*(\d+)/);
        if (capacityMatch) {
          capacity = parseInt(capacityMatch[1], 10);
          description = description.replace(/\n\nToplam Kapasite:\s*\d+.*/, "").trim();
        }
        const techMatch = description.match(/Teknik Özellikler:\s*(.+?)(?:\n\nErişim İzni Olan Editörler:|\n\nMerkez Sorumluları:|$)/s);
        if (techMatch) {
          technicalDetails = techMatch[1].trim();
          description = description.replace(/Teknik Özellikler:.*/, "").trim();
        }
        
        const editorMatch = initialCenter.description.match(/Erişim İzni Olan Editörler:\s*\[([^\]]+)\]/);
        if (editorMatch) {
          allowedUserIds = editorMatch[1]
            .split(',')
            .map(id => id.trim().replace(/['"]/g, ''))
            .filter(id => id.length > 0);
        }
        const merkezMatch = initialCenter.description.match(/Merkez Sorumluları:\s*\[([^\]]+)\]/);
        if (merkezMatch) {
          merkezSorumlusuIds = merkezMatch[1]
            .split(',')
            .map(id => id.trim().replace(/['"]/g, ''))
            .filter(id => id.length > 0);
        }
        
        description = description
          .replace(/\n\nErişim İzni Olan Editörler:.*/, "")
          .replace(/\n\nMerkez Sorumluları:.*/, "")
          .trim();

        setForm({
          name: initialCenter.name || "",
          address: initialCenter.address || "",
          description,
          imageUrl: initialCenter.imageUrl || "",
          capacity,
          technicalDetails,
          allowedUserIds,
        });
        setImagePreview(initialCenter.imageUrl || "");
        setSelectedTechnicalDetails(parseTechnicalDetails(technicalDetails));
        setSelectedEditorIds(new Set(allowedUserIds));
        setSelectedMerkezSorumlusuIds(new Set(merkezSorumlusuIds));
      } else {
        setForm({
          ...emptyForm,
          capacity: 0,
          technicalDetails: "",
          allowedUserIds: [],
        });
        setImagePreview("");
        setSelectedTechnicalDetails(new Set());
        setSelectedEditorIds(new Set());
        setSelectedMerkezSorumlusuIds(new Set());
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [open, mode, initialCenter]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Lütfen bir görsel dosyası seçin.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Görsel boyutu 5MB'dan küçük olmalıdır.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 400;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          const scale = Math.min(MAX_SIZE / width, MAX_SIZE / height);
          width = Math.floor(width * scale);
          height = Math.floor(height * scale);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Backend 1000 karakter limitine sahip - kaliteyi koruyarak optimize et
          // İlk olarak makul bir boyuta küçült (kaliteyi koruyarak)
          const INITIAL_MAX_SIZE = 800; // Daha büyük başlangıç boyutu
          if (width > INITIAL_MAX_SIZE || height > INITIAL_MAX_SIZE) {
            const scale = Math.min(INITIAL_MAX_SIZE / width, INITIAL_MAX_SIZE / height);
            width = Math.floor(width * scale);
            height = Math.floor(height * scale);
            canvas.width = width;
            canvas.height = height;
          }
          
          // PNG'lerde şeffaf arka plan için beyaz arka plan ekle
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // Yüksek kalite ile başla (0.85)
          let quality = 0.85;
          let base64String = canvas.toDataURL("image/jpeg", quality);
          let attempts = 0;
          const MAX_ATTEMPTS = 20;
          
          // Önce kaliteyi hafifçe düşürerek dene (kaliteyi korumaya çalış)
          while (base64String.length > 1000 && attempts < MAX_ATTEMPTS && quality > 0.6) {
            attempts++;
            quality = Math.max(0.6, quality - 0.05); // 0.85'ten 0.6'ya kadar kademeli düşür
            base64String = canvas.toDataURL("image/jpeg", quality);
            if (base64String.length <= 1000) break;
          }
          
          // Kalite yeterli değilse boyutu hafifçe küçült (kaliteyi koruyarak)
          if (base64String.length > 1000 && quality >= 0.6) {
            const targetRatio = Math.sqrt(950 / base64String.length); // 950 karakter hedefi
            const scale = Math.max(0.7, Math.min(0.95, targetRatio)); // %70-95 arası küçültme
            width = Math.max(300, Math.floor(width * scale)); // Minimum 300px (kalite için)
            height = Math.max(300, Math.floor(height * scale));
            canvas.width = width;
            canvas.height = height;
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, width, height);
            base64String = canvas.toDataURL("image/jpeg", quality);
          }
          
          // Hala çok uzunsa kaliteyi biraz daha düşür ama çok değil
          if (base64String.length > 1000 && quality > 0.5) {
            quality = 0.5;
            base64String = canvas.toDataURL("image/jpeg", quality);
          }
          
          // Son çare: Boyutu biraz daha küçült ama kaliteyi koru
          if (base64String.length > 1000) {
            const scale = 0.8; // %20 küçült
            width = Math.max(250, Math.floor(width * scale));
            height = Math.max(250, Math.floor(height * scale));
            canvas.width = width;
            canvas.height = height;
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, width, height);
            base64String = canvas.toDataURL("image/jpeg", quality);
          }
          
          // Çok nadir durum: Son çare küçük boyut ama kaliteyi mümkün olduğunca koru
          if (base64String.length > 1000) {
            width = 400;
            height = 400;
            canvas.width = width;
            canvas.height = height;
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, width, height);
            quality = Math.max(0.4, quality); // Minimum 0.4 kalite
            base64String = canvas.toDataURL("image/jpeg", quality);
          }
          
          // Son kontrol: Eğer hala çok uzunsa, kullanıcıya URL kullanmasını öner
          if (base64String.length > 1000) {
            toast.warning("Görsel optimize edildi ancak hala büyük. Görsel URL'i kullanmanız önerilir.");
          }
          
          setForm((p) => ({ ...p, imageUrl: base64String }));
          setImagePreview(base64String);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleTechnicalDetailToggle = (detailId: string) => {
    const newSelected = new Set(selectedTechnicalDetails);
    if (newSelected.has(detailId)) newSelected.delete(detailId);
    else newSelected.add(detailId);
    setSelectedTechnicalDetails(newSelected);
    setForm((p) => ({ ...p, technicalDetails: formatTechnicalDetails(newSelected) }));
  };

  // selectedEditorIds değiştiğinde form.allowedUserIds'i güncelle
  useEffect(() => {
    setForm((p) => ({ ...p, allowedUserIds: Array.from(selectedEditorIds) }));
  }, [selectedEditorIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Merkez adı girin.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Kapasite ve teknik detayları description'a ekle
      let description = form.description.trim();
      if (form.capacity > 0) {
        description = `${description}\n\nToplam Kapasite: ${form.capacity} kişi`.trim();
      }
      if (form.technicalDetails.trim()) {
        description = `${description}\n\nTeknik Özellikler: ${form.technicalDetails}`.trim();
      }
      
      // Erişim izni olan editörleri description'a ekle
      const editorIdsArray = Array.from(selectedEditorIds);
      if (editorIdsArray.length > 0) {
        description = `${description}\n\nErişim İzni Olan Editörler: [${editorIdsArray.join(',')}]`.trim();
      }
      // Merkez sorumlularını description'a ekle
      const merkezSorumlusuArray = Array.from(selectedMerkezSorumlusuIds);
      if (merkezSorumlusuArray.length > 0) {
        description = `${description}\n\nMerkez Sorumluları: [${merkezSorumlusuArray.join(',')}]`.trim();
      }

      const centerData: CreateCenterData = {
        name: form.name.trim(),
        address: form.address.trim(),
        description,
        imageUrl: form.imageUrl.trim(),
      };

      if (mode === "create") {
        const created = await createCenter(centerData);
        toast.success("Merkez oluşturuldu.");
        await onSuccess(created);
        onOpenChange(false);
      } else if (initialCenter) {
        const updated = await updateCenter(initialCenter.id, centerData);
        toast.success("Merkez güncellendi.");
        await onSuccess(updated);
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = mode === "create" ? "Yeni Merkez Ekle" : "Merkezi Düzenle";
  const description =
    mode === "create"
      ? "Yeni merkez bilgilerini girin."
      : "Merkez bilgilerini güncelleyin.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-3 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 flex-shrink-0 border-b">
          <DialogTitle className="text-base sm:text-lg text-foreground flex items-center gap-1.5 sm:gap-2">
            <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-3 sm:px-6">
            <div className="space-y-3 sm:space-y-4 py-3 sm:py-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="center-name" className="text-xs sm:text-sm">Merkez Adı *</Label>
                <Input
                  id="center-name"
                  className="text-xs sm:text-sm h-8 sm:h-10"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Örn: Şehitkamil Kültür Kongre Merkezi"
                  required
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="center-address" className="text-xs sm:text-sm">Adres</Label>
                <Input
                  id="center-address"
                  className="text-xs sm:text-sm h-8 sm:h-10"
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Adres"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="center-description" className="text-xs sm:text-sm">Açıklama</Label>
                <Textarea
                  id="center-description"
                  className="text-xs sm:text-sm min-h-16 sm:min-h-20 resize-none"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Kısa açıklama"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="center-capacity" className="text-xs sm:text-sm">Toplam Kapasite</Label>
                <Input
                  id="center-capacity"
                  type="number"
                  min={0}
                  className="text-xs sm:text-sm h-8 sm:h-10"
                  value={form.capacity || ""}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      capacity: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  placeholder="Kişi sayısı"
                />
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Merkezin toplam kapasitesi (isteğe bağlı)
                </p>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="center-image" className="text-xs sm:text-sm">Görsel</Label>
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="gap-1.5 sm:gap-2 h-8 sm:h-10 text-xs sm:text-sm"
                    >
                      <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Görsel Seç
                    </Button>
                    <input
                      ref={fileInputRef}
                      id="center-image"
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    {imagePreview && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setImagePreview("");
                          setForm((p) => ({ ...p, imageUrl: "" }));
                        }}
                        className="gap-1.5 sm:gap-2 text-destructive h-8 sm:h-10 text-xs sm:text-sm"
                      >
                        <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Kaldır
                      </Button>
                    )}
                  </div>
                  {imagePreview ? (
                    <div className="relative w-full overflow-hidden rounded-lg border border-border">
                      <img src={imagePreview} alt="Önizleme" className="h-32 sm:h-48 w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-32 sm:h-48 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25">
                      <div className="text-center">
                        <ImageIcon className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground/50" />
                        <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground">Görsel seçilmedi</p>
                      </div>
                    </div>
                  )}
                  <Input
                    className="text-xs sm:text-sm h-8 sm:h-10"
                    value={form.imageUrl}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, imageUrl: e.target.value }));
                      setImagePreview(e.target.value);
                    }}
                    placeholder="Veya görsel URL'i girin..."
                    className="mt-2"
                  />
                </div>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">Teknik Özellikler</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 rounded-lg border p-2 sm:p-3 max-h-48 sm:max-h-60 overflow-y-auto">
                  {TECHNICAL_DETAILS_OPTIONS.map((option) => (
                    <div key={option.id} className="flex items-center space-x-1.5 sm:space-x-2">
                      <Checkbox
                        id={`center-tech-${option.id}`}
                        checked={selectedTechnicalDetails.has(option.id)}
                        onCheckedChange={() => handleTechnicalDetailToggle(option.id)}
                      />
                      <label
                        htmlFor={`center-tech-${option.id}`}
                        className="text-xs sm:text-sm font-medium leading-none cursor-pointer"
                      >
                        {option.label}
                      </label>
                    </div>
                  ))}
                </div>
                <Textarea
                  className="text-xs sm:text-sm min-h-16 sm:min-h-20 resize-none mt-1 sm:mt-2"
                  value={form.technicalDetails}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, technicalDetails: e.target.value }));
                    setSelectedTechnicalDetails(parseTechnicalDetails(e.target.value));
                  }}
                  placeholder="Ek teknik detaylar (isteğe bağlı)"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">Erişim İzni Olan Editörler</Label>
                <div className="space-y-1.5 sm:space-y-2 rounded-lg border p-2 sm:p-3 max-h-40 sm:max-h-48 overflow-y-auto">
                  {editors.length === 0 ? (
                    <p className="text-xs sm:text-sm text-muted-foreground">Henüz editör kullanıcı yok.</p>
                  ) : (
                    editors.map((editor) => (
                      <div key={editor.id} className="flex items-center space-x-1.5 sm:space-x-2">
                        <Checkbox
                          id={`center-editor-${editor.id}`}
                          checked={selectedEditorIds.has(editor.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedEditorIds);
                            if (checked) next.add(editor.id);
                            else next.delete(editor.id);
                            setSelectedEditorIds(next);
                          }}
                        />
                        <label
                          htmlFor={`center-editor-${editor.id}`}
                          className="text-xs sm:text-sm font-medium leading-none cursor-pointer flex-1 break-words"
                        >
                          {editor.name} ({editor.email}) - {getDepartmentName(editor.department)}
                        </label>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Bu merkeze erişim izni olan editörleri seçin (düzenleme yapabilir).
                </p>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">Merkez Sorumluları</Label>
                <div className="space-y-1.5 sm:space-y-2 rounded-lg border p-2 sm:p-3 max-h-40 sm:max-h-48 overflow-y-auto">
                  {merkezSorumlulari.length === 0 ? (
                    <p className="text-xs sm:text-sm text-muted-foreground">Henüz merkez sorumlusu kullanıcı yok.</p>
                  ) : (
                    merkezSorumlulari.map((u) => (
                      <div key={u.id} className="flex items-center space-x-1.5 sm:space-x-2">
                        <Checkbox
                          id={`center-ms-${u.id}`}
                          checked={selectedMerkezSorumlusuIds.has(u.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedMerkezSorumlusuIds);
                            if (checked) next.add(u.id);
                            else next.delete(u.id);
                            setSelectedMerkezSorumlusuIds(next);
                          }}
                        />
                        <label
                          htmlFor={`center-ms-${u.id}`}
                          className="text-xs sm:text-sm font-medium leading-none cursor-pointer flex-1 break-words"
                        >
                          {u.name} ({u.email})
                        </label>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Bu merkezi sadece görüntüleyebilecek merkez sorumlularını seçin (düzenleme yapamaz).
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="px-3 sm:px-6 pb-4 sm:pb-6 pt-3 sm:pt-4 border-t flex-shrink-0 bg-background flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" className="w-full sm:w-auto h-9 sm:h-10 text-sm" onClick={() => onOpenChange(false)}>
              İptal
            </Button>
            <Button
              type="submit"
              disabled={!form.name.trim() || isSubmitting}
              className="gap-1.5 sm:gap-2 w-full sm:w-auto h-9 sm:h-10 text-sm"
            >
              {isSubmitting ? "Kaydediliyor..." : mode === "create" ? "Oluştur" : "Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
