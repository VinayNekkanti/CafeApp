export const THEME = {
  colors: {
    // Light theme cozy cafe palette
    light: {
      background: '#FDFBF7',      // Warm cream paper
      surface: '#FFFFFF',         // Crisp clean cards
      surfaceMuted: '#F5EFEB',    // Soft beige backgrounds
      border: '#E8DFD8',          // Delicate cafe-latte borders
      
      text: '#2D1F18',            // Rich dark roast brown
      textMuted: '#6E5D53',       // Roasted bean gray-brown
      textLight: '#A39287',       // Soft froth brown-gray
      
      primary: '#5C4033',         // Dark espresso brown
      primaryLight: '#8B5A2B',    // Warm caramel brown
      primaryDark: '#3E2723',     // Darkest cocoa
      
      accent: '#D97706',          // Golden honey yellow / amber
      accentLight: '#FEF3C7',     // Soft butter yellow
      
      success: '#15803D',         // Forest green (Quiet)
      successLight: '#DCFCE7',    // Soft mint green
      
      warning: '#B45309',         // Amber orange (Moderate / Busy)
      warningLight: '#FEF3C7',
      
      danger: '#B91C1C',          // Brick red (Full)
      dangerLight: '#FEE2E2',
      
      tint: '#5C4033',
      tabIconDefault: '#A39287',
      tabIconSelected: '#5C4033',
    },
    // Dark theme cozy night cafe palette
    dark: {
      background: '#120C0A',      // Midnight dark roast
      surface: '#1A120E',         // Dark cocoa surface
      surfaceMuted: '#241A14',    // Muted bean brown
      border: '#362720',          // Espresso wood borders
      
      text: '#F5EFEB',            // Sweet cream white
      textMuted: '#C2B5AD',       // Soft steam gray
      textLight: '#8C7C73',       // Muted coffee grounds
      
      primary: '#D7CCC8',         // Light creamy beige
      primaryLight: '#EFEBE9',    // Soft froth
      primaryDark: '#5C4033',     // Espresso base
      
      accent: '#F59E0B',          // Cozy glowing amber
      accentLight: '#451A03',     // Dark honey glow
      
      success: '#22C55E',         // Neon forest green
      successLight: '#052E16',
      
      warning: '#F59E0B',         // Glowing orange
      warningLight: '#451A03',
      
      danger: '#EF4444',          // Crimson glow
      dangerLight: '#450A0A',
      
      tint: '#D7CCC8',
      tabIconDefault: '#8C7C73',
      tabIconSelected: '#D7CCC8',
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  roundness: {
    sm: 6,
    md: 12,
    lg: 18,
    full: 9999,
  },
  typography: {
    fontFamilies: {
      regular: 'System',
      bold: 'System',
    },
    sizes: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 22,
      xxl: 28,
      title: 32,
    },
  },
  shadows: {
    light: {
      shadowColor: '#5C4033',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    dark: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 3,
    },
  },
};
