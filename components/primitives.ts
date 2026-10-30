import { tv } from "tailwind-variants";

// Page title: Newsreader 32/1.1 in CWRU Blue, one face and one color.
// `color` is kept for call-site compatibility; every value renders the brand title.
export const title = tv({
  base: "inline font-display font-medium tracking-[-0.01em] text-cwru-blue [text-wrap:balance]",
  variants: {
    color: {
      violet: "",
      yellow: "",
      blue: "",
      cyan: "",
      green: "",
      pink: "",
      foreground: "",
    },
    size: {
      sm: "text-[26px] leading-[1.15]",
      md: "text-[28px] leading-[1.1] md:text-[32px]",
      lg: "text-[32px] leading-[1.1]",
    },
    fullWidth: {
      true: "w-full block",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export const subtitle = tv({
  base: "my-2 block w-full max-w-[65ch] text-[15px] leading-[1.55] text-muted",
  variants: {
    fullWidth: {
      true: "!w-full",
    },
  },
  defaultVariants: {
    fullWidth: true,
  },
});
