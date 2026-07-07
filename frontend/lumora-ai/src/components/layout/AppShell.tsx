import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useGetProfileQuery } from "@/features/auth/authApi";
import { updateUser } from "@/features/auth/authSlice";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { RealtimeBridge } from "./RealtimeBridge";
import { BrandLockup } from "./Brand";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

const AppShell = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const { data: profile } = useGetProfileQuery(undefined, {
    skip: !user,
  });

  useEffect(() => {
    if (!profile) {
      return;
    }

    dispatch(updateUser(profile));
  }, [dispatch, profile]);

  return (
    <div className="fixed inset-0 flex min-h-0 overflow-hidden bg-gray-50">
      <RealtimeBridge />
      {/* Desktop Sidebar */}
      <Sidebar className="hidden lg:flex" />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Mobile Top Bar with Hamburger */}
        <div className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
          <BrandLockup />
          
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-gray-500">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64">
              <Sidebar onClose={() => setIsMobileMenuOpen(false)} className="border-r-0" />
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop Top Bar */}
        <TopBar />

        {/* Page Content */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppShell;
