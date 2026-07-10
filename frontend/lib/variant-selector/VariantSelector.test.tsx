import { render, screen, fireEvent } from '@testing-library/react';
import { VariantSelector } from './VariantSelector';
import type { VariantData } from './types';

const variants: VariantData[] = [
  {
    id: 'v1',
    sku: 'SKU-RED-M',
    options: [
      { attributeName: 'Couleur', value: 'Rouge' },
      { attributeName: 'Taille', value: 'M' },
    ],
    costPrice: 10,
    stock: 5,
    weightKg: 0.4,
  },
  {
    id: 'v2',
    sku: 'SKU-RED-L',
    options: [
      { attributeName: 'Couleur', value: 'Rouge' },
      { attributeName: 'Taille', value: 'L' },
    ],
    costPrice: 10,
    stock: 0,
    weightKg: 0.45,
  },
  {
    id: 'v3',
    sku: 'SKU-BLUE-M',
    options: [
      { attributeName: 'Couleur', value: 'Bleu' },
      { attributeName: 'Taille', value: 'M' },
    ],
    costPrice: 12,
    stock: 3,
    weightKg: 0.4,
  },
];

const currency = { code: 'XOF', symbol: 'FCFA', rateFromReference: 90, decimals: 0 };
const margin = { type: 'percentage' as const, value: 50 };

describe('VariantSelector', () => {
  it("affiche les groupes d'attributs avec leurs options", () => {
    render(<VariantSelector variants={variants} marginFormula={margin} currency={currency} />);
    expect(screen.getByText('Couleur')).toBeInTheDocument();
    expect(screen.getByText('Taille')).toBeInTheDocument();
    expect(screen.getByText('Rouge')).toBeInTheDocument();
    expect(screen.getByText('Bleu')).toBeInTheDocument();
  });

  it('désactive une option en rupture de stock une fois le reste de la sélection fait', () => {
    render(<VariantSelector variants={variants} marginFormula={margin} currency={currency} />);
    fireEvent.click(screen.getByText('Rouge'));
    const tailleL = screen.getByText(/L/, { selector: 'button' });
    expect(tailleL).toBeDisabled();
  });

  it('appelle onVariantChange avec le prix et le poids une fois la sélection complète', () => {
    const onVariantChange = jest.fn();
    render(
      <VariantSelector
        variants={variants}
        marginFormula={margin}
        currency={currency}
        onVariantChange={onVariantChange}
      />
    );

    fireEvent.click(screen.getByText('Bleu'));
    fireEvent.click(screen.getAllByText('M')[0]);

    expect(onVariantChange).toHaveBeenCalledWith(
      expect.objectContaining({
        currencyCode: 'XOF',
        weightKg: 0.4,
        sku: 'SKU-BLUE-M',
      })
    );
  });

  it('appelle onValidityChange(false) tant que la sélection est incomplète', () => {
    const onValidityChange = jest.fn();
    render(
      <VariantSelector
        variants={variants}
        marginFormula={margin}
        currency={currency}
        onValidityChange={onValidityChange}
      />
    );
    expect(onValidityChange).toHaveBeenCalledWith(false);
  });

  it('appelle onValidityChange(true) une fois une variante en stock entièrement sélectionnée', () => {
    const onValidityChange = jest.fn();
    render(
      <VariantSelector
        variants={variants}
        marginFormula={margin}
        currency={currency}
        onValidityChange={onValidityChange}
      />
    );
    fireEvent.click(screen.getByText('Bleu'));
    fireEvent.click(screen.getAllByText('M')[0]);
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it("n'affiche rien si la liste de variantes est vide", () => {
    const { container } = render(
      <VariantSelector variants={[]} marginFormula={margin} currency={currency} />
    );
    expect(container.firstChild).toBeNull();
  });
});
