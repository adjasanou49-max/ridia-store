import Link from 'next/link';
import {
  Shirt,
  Footprints,
  Smartphone,
  UtensilsCrossed,
  Sparkles,
  Scissors,
  User,
  Package,
} from 'lucide-react';
import type { Category } from '@/types';

const ICONS_BY_KEYWORD: { match: RegExp; icon: typeof Shirt; bg: string; fg: string }[] = [
  { match: /femme/i, icon: Shirt, bg: 'bg-pink-50', fg: 'text-pink-500' },
  { match: /homme/i, icon: User, bg: 'bg-blue-50', fg: 'text-blue-500' },
  { match: /chaussure/i, icon: Footprints, bg: 'bg-amber-50', fg: 'text-amber-600' },
  { match: /électro|electro|téléphone|telephone/i, icon: Smartphone, bg: 'bg-teal-50', fg: 'text-teal-600' },
  { match: /maison|cuisine/i, icon: UtensilsCrossed, bg: 'bg-green-50', fg: 'text-green-600' },
  { match: /beauté|beaute|cosm/i, icon: Sparkles, bg: 'bg-purple-50', fg: 'text-purple-500' },
  { match: /wax|boubou|tissu/i, icon: Scissors, bg: 'bg-orange-50', fg: 'text-brand-600' },
];

function pickIcon(name: string) {
  return ICONS_BY_KEYWORD.find((entry) => entry.match.test(name)) ?? {
    icon: Package,
    bg: 'bg-gray-100',
    fg: 'text-gray-500',
  };
}

export function CategoryIconRow({ categories }: { categories: Category[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-7 md:gap-3">
      {categories.map((cat) => {
        const { icon: Icon, bg, fg } = pickIcon(cat.name);
        return (
          <Link
            key={cat.id}
            href={`/products?categoryId=${cat.id}`}
            className="flex flex-col items-center gap-1.5 shrink-0 w-16 md:w-auto"
          >
            <div className={`w-12 h-12 rounded-full ${bg} flex items-center justify-center`}>
              <Icon size={20} className={fg} />
            </div>
            <span className="text-[11px] text-center text-gray-600 leading-tight">{cat.name}</span>
          </Link>
        );
      })}
    </div>
  );
}
