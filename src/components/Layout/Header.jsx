/**
 * Header — Top bar with datetime, seller info
 */
import { useState, useEffect } from 'react';
import { useSeller } from '../../context/SellerContext';
import { User, LogOut, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Header() {
  const { currentSeller, logout } = useSeller();
  const [now, setNow] = useState(new Date());

  // Update clock every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="header-datetime">
          <Clock size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {format(now, "EEEE dd 'de' MMMM, HH:mm", { locale: es })}
        </div>
      </div>
      <div className="header-right">
        {currentSeller && (
          <>
            <div className="header-seller">
              <User size={16} />
              {currentSeller.name}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout} title="Cerrar sesión">
              <LogOut size={16} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
