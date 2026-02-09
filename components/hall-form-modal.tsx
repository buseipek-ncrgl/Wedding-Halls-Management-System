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
import { createHall, updateHall } from "@/lib/api/halls";
import type { CreateHallData, UpdateHallData } from "@/lib/api/halls";
import type { WeddingHall } from "@/lib/types";
import { toUserFriendlyMessage } from "@/lib/utils/api-error";
import { toast } from "sonner";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import { getCenters, type Center } from "@/lib/api/centers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Mode = "create" | "update";

interface HallFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  initialHall?: WeddingHall | null;
  /** Merkez detaydan salon eklerken bu merkezi önceden seçili getir */
  initialCenterId?: string;
  onSuccess: (hall: WeddingHall) => void | Promise<void>;
}

const emptyForm: CreateHallData = {
  centerId: "",
  name: "",
  address: "",
  capacity: 0,
  description: "",
  imageUrl: "",
  technicalDetails: "",
  allowedUserIds: [],
};

// Nikah salonu için teknik detay seçenekleri
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

export function HallFormModal({
  open,
  onOpenChange,
  mode,
  initialHall,
  initialCenterId,
  onSuccess,
}: HallFormModalProps) {
  const [form, setForm] = useState<CreateHallData>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [selectedTechnicalDetails, setSelectedTechnicalDetails] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [centers, setCenters] = useState<Center[]>([]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Lütfen bir görsel dosyası seçin.");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Görsel boyutu 5MB'dan küçük olmalıdır.");
      return;
    }

    // Görseli optimize et (sıkıştır ve boyutlandır)
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        // Canvas ile görseli optimize et
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1920; // Maksimum genişlik
        const MAX_HEIGHT = 1080; // Maksimum yükseklik
        let width = img.width;
        let height = img.height;

        // Boyutları orantılı olarak küçült
        if (width > height) {
          if (width > MAX_WIDTH) {
            height = (height * MAX_WIDTH) / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = (width * MAX_HEIGHT) / height;
            height = MAX_HEIGHT;
          }
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
        } else {
          // Canvas desteklenmiyorsa direkt kullan (nadir durum)
          const base64String = reader.result as string;
          if (base64String.length > 1000) {
            toast.warning("Görsel optimize edilemedi. Görsel URL'i kullanmanız önerilir.");
            // Yine de eklemeyi dene
          }
          setForm((p) => ({ ...p, imageUrl: base64String }));
          setImagePreview(base64String);
        }
      };
      img.onerror = () => {
        // Hata durumunda direkt kullan
        const base64String = reader.result as string;
        setForm((p) => ({ ...p, imageUrl: base64String }));
        setImagePreview(base64String);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Teknik detayları string'den Set'e çevir (label'lardan ID'leri bul)
  const parseTechnicalDetails = (details: string): Set<string> => {
    if (!details) return new Set();
    const foundIds = new Set<string>();
    const items = details.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    
    // Her item için label'a göre ID bul
    items.forEach(item => {
      const option = TECHNICAL_DETAILS_OPTIONS.find(
        opt => opt.label.toLowerCase() === item.toLowerCase() || opt.id === item
      );
      if (option) {
        foundIds.add(option.id);
      }
    });
    
    return foundIds;
  };

  // Set'i string'e çevir (ID'lerden label'ları al)
  const formatTechnicalDetails = (selected: Set<string>): string => {
    const labels = Array.from(selected)
      .map(id => {
        const option = TECHNICAL_DETAILS_OPTIONS.find(opt => opt.id === id);
        return option ? option.label : id;
      })
      .filter(Boolean);
    return labels.join(", ");
  };

  // Merkezleri yükle
  useEffect(() => {
    if (open) {
      getCenters().then(setCenters).catch(() => setCenters([]));
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      if (mode === "update" && initialHall) {
        setForm({
          centerId: initialHall.centerId || "",
          name: initialHall.name,
          address: initialHall.address,
          capacity: initialHall.capacity,
          description: initialHall.description,
          imageUrl: initialHall.imageUrl || "",
          technicalDetails: initialHall.technicalDetails || "",
          allowedUserIds: [],
        });
        setImagePreview(initialHall.imageUrl || "");
        // Mevcut teknik detayları parse et
        const existingDetails = parseTechnicalDetails(initialHall.technicalDetails || "");
        setSelectedTechnicalDetails(existingDetails);
      } else {
        setForm({
          ...emptyForm,
          centerId: initialCenterId ?? "",
        });
        setImagePreview("");
        setSelectedTechnicalDetails(new Set());
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [open, mode, initialHall, initialCenterId]);

  const handleTechnicalDetailToggle = (detailId: string) => {
    const newSelected = new Set(selectedTechnicalDetails);
    if (newSelected.has(detailId)) {
      newSelected.delete(detailId);
    } else {
      newSelected.add(detailId);
    }
    setSelectedTechnicalDetails(newSelected);
    // Form state'ini de güncelle
    setForm((p) => ({
      ...p,
      technicalDetails: formatTechnicalDetails(newSelected),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (form.capacity < 1) {
      toast.error("Kapasite 1 veya daha büyük olmalıdır.");
      return;
    }

    // Görsel URL kontrolü - Backend 1000 karakter limitine sahip
    // Eğer base64 görsel çok büyükse, kullanıcıya URL kullanmasını öner ama engelleme
    if (form.imageUrl && form.imageUrl.length > 1000) {
      if (form.imageUrl.startsWith("data:image")) {
        toast.warning("Görsel optimize edildi ancak hala büyük olabilir. Backend reddederse görsel URL'i kullanın.");
        // Devam et, backend reddederse kullanıcı URL kullanabilir
      } else {
        toast.error("Görsel URL'i çok uzun. Maksimum 1000 karakter olmalıdır.");
        return;
      }
    }

    // Seçilen teknik detayları form'a ekle
    const finalForm = {
      ...form,
      technicalDetails: formatTechnicalDetails(selectedTechnicalDetails),
      allowedUserIds: [], // Erişim izinleri merkez seviyesinde yönetiliyor
    };

    // CenterId kontrolü
    if (!finalForm.centerId) {
      toast.error("Lütfen bir merkez seçin.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "create") {
        const created = await createHall(finalForm);
        toast.success("Salon oluşturuldu.");
        await onSuccess(created);
        onOpenChange(false);
      } else if (initialHall) {
        const updated = await updateHall(initialHall.id, finalForm);
        toast.success("Salon güncellendi.");
        await onSuccess(updated);
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = mode === "create" ? "Yeni Salon Ekle" : "Salonu Düzenle";
  const description =
    mode === "create"
      ? "Yeni nikah salonu bilgilerini girin."
      : "Salon bilgilerini güncelleyin.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-3 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 flex-shrink-0 border-b">
          <DialogTitle className="text-base sm:text-lg text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-3 sm:px-6">
            <div className="space-y-3 sm:space-y-4 py-3 sm:py-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="hall-center" className="text-xs sm:text-sm">Merkez *</Label>
            <Select
              value={form.centerId}
              onValueChange={(value) => setForm((p) => ({ ...p, centerId: value }))}
            >
              <SelectTrigger className="h-8 sm:h-10 text-xs sm:text-sm">
                <SelectValue placeholder="Merkez seçin" />
              </SelectTrigger>
              <SelectContent>
                {centers.map((center) => (
                  <SelectItem key={center.id} value={center.id}>
                    {center.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="hall-name" className="text-xs sm:text-sm">Ad</Label>
            <Input
              id="hall-name"
              className="text-xs sm:text-sm h-8 sm:h-10"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Salon adı"
              required
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="hall-address" className="text-xs sm:text-sm">Adres</Label>
            <Input
              id="hall-address"
              className="text-xs sm:text-sm h-8 sm:h-10"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              placeholder="Adres"
              required
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="hall-capacity" className="text-xs sm:text-sm">Kapasite</Label>
            <Input
              id="hall-capacity"
              type="number"
              min={1}
              className="text-xs sm:text-sm h-8 sm:h-10"
              value={form.capacity || ""}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  capacity: parseInt(e.target.value, 10) || 0,
                }))
              }
              placeholder="Kişi sayısı"
              required
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="hall-description" className="text-xs sm:text-sm">Açıklama</Label>
            <Textarea
              id="hall-description"
              className="text-xs sm:text-sm min-h-16 sm:min-h-20 resize-none"
              value={form.description}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
              placeholder="Açıklama"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="hall-image" className="text-xs sm:text-sm">Görsel</Label>
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
                <Input
                  ref={fileInputRef}
                  id="hall-image"
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
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="h-32 sm:h-48 w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-32 sm:h-48 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25">
                  <div className="text-center">
                    <ImageIcon className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground/50" />
                    <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground">
                      Görsel seçilmedi
                    </p>
                  </div>
                </div>
              )}
              <Input
                id="hall-imageUrl"
                className="text-xs sm:text-sm h-8 sm:h-10 mt-2"
                value={form.imageUrl}
                onChange={(e) => {
                  setForm((p) => ({ ...p, imageUrl: e.target.value }));
                  setImagePreview(e.target.value);
                }}
                placeholder="Veya görsel URL'i girin..."
              />
            </div>
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="hall-technicalDetails" className="text-xs sm:text-sm">Teknik Detaylar</Label>
            <div className="space-y-2 sm:space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-3 rounded-lg border p-2 sm:p-4">
                {TECHNICAL_DETAILS_OPTIONS.map((option) => (
                  <div key={option.id} className="flex items-center space-x-1.5 sm:space-x-2">
                    <Checkbox
                      id={`tech-${option.id}`}
                      checked={selectedTechnicalDetails.has(option.id)}
                      onCheckedChange={() => handleTechnicalDetailToggle(option.id)}
                    />
                    <label
                      htmlFor={`tech-${option.id}`}
                      className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
              <Textarea
                id="hall-technicalDetails"
                className="text-xs sm:text-sm min-h-16 sm:min-h-20 resize-none"
                value={form.technicalDetails}
                onChange={(e) => {
                  setForm((p) => ({ ...p, technicalDetails: e.target.value }));
                  // Manuel giriş yapılırsa selectedTechnicalDetails'i güncelle
                  const parsed = parseTechnicalDetails(e.target.value);
                  setSelectedTechnicalDetails(parsed);
                }}
                placeholder="Ek teknik detaylar veya özel notlar (isteğe bağlı)..."
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Yukarıdaki seçeneklerden seçim yapabilir veya manuel olarak ek bilgi girebilirsiniz.
              </p>
            </div>
          </div>
            </div>
          </div>
          <DialogFooter className="px-3 sm:px-6 pb-4 sm:pb-6 pt-3 sm:pt-4 border-t flex-shrink-0 bg-background flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto h-9 sm:h-10 text-sm"
              onClick={() => onOpenChange(false)}
            >
              İptal
            </Button>
            <Button
              type="submit"
              disabled={!form.name.trim() || isSubmitting}
              className="gap-1.5 sm:gap-2 bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto h-9 sm:h-10 text-sm"
            >
              {isSubmitting ? "Kaydediliyor..." : mode === "create" ? "Oluştur" : "Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
