"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Dashboard ana sayfası yorum satırına alındı - İlk sayfa olarak salonlar açılıyor
// Geri aktif etmek için bu dosyayı eski haline getirin ve redirect'i kaldırın
/*
import { CalendarView } from "@/components/calendar-view";

export default function DashboardPage() {
  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden min-w-0">
      <div className="w-full max-w-full min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">Ana Sayfa</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Nikah salonları doluluk durumunu görüntüleyin ve yönetin
        </p>
      </div>
      <div className="w-full max-w-full overflow-x-hidden min-w-0">
        <CalendarView />
      </div>
    </div>
  );
}
*/

export default function DashboardPage() {
  const router = useRouter();
  
  useEffect(() => {
    // İlk sayfa olarak salonlar sayfasına yönlendir
    router.replace("/dashboard/salonlar");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <p className="text-muted-foreground">Yönlendiriliyor...</p>
    </div>
  );
}
