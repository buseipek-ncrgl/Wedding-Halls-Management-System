"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Merkez detayı artık Salonlar sayfasında görüntüleniyor.
 * Eski merkez detay linklerini salonlara yönlendir.
 */

export default function MerkezDetayPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/salonlar");
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <p className="text-muted-foreground">Yönlendiriliyor...</p>
    </div>
  );
}
