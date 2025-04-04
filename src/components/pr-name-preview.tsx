import { Badge } from "./ui/badge";

export function PrNamePreview({ prName }: { prName: string }) {
  function renderPrName() {
    if (!prName) return null;
    const parts = prName.split(/(%(repository|name|number)%)/g);
    return parts.map((part, idx) => {
      if (part === "%repository%") {
        return (
          <Badge key={idx} variant="outline" className="mx-1">
            Repository
          </Badge>
        );
      } else if (part === "%name%") {
        return (
          <Badge key={idx} variant="outline" className="mx-1">
            Name
          </Badge>
        );
      } else if (part === "%number%") {
        return (
          <Badge key={idx} variant="outline" className="mx-1">
            Number
          </Badge>
        );
      } else if (
        part !== "repository" &&
        part !== "name" &&
        part !== "number"
      ) {
        return part;
      }
    });
  }
  return <div>{renderPrName()}</div>;
}
