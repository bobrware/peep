{
  mkShell,
  alejandra,
  nodejs,
  pnpm,
}:
mkShell {
  name = "peep";

  packages = [
    nodejs
    pnpm

    alejandra
  ];
}
