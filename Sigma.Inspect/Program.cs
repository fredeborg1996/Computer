using Sigma.Core;

if (args.Length != 1)
{
    Console.Error.WriteLine("Brug: Sigma.Inspect <projekt.sit|bibliotek.sli>");
    return 2;
}

try
{
    var project = Path.GetExtension(args[0]).Equals(".sli", StringComparison.OrdinalIgnoreCase)
        ? SigmaProjectReader.ReadLibrary(args[0]) : SigmaProjectReader.Read(args[0]);
    Console.WriteLine($"Projekt: {project.Name}");
    Console.WriteLine($"Projektnummer: {project.ProjectNumber}");
    Console.WriteLine($"Sigma-version i fil: {project.SigmaVersion}");
    Console.WriteLine($"Filversion: {project.FileSaveVersion}");
    Console.WriteLine($"Komponenter: {project.ComponentCount}");
    foreach (var component in project.Components)
        Print(component, 0);
    return 0;
}
catch (Exception error) when (error is IOException or InvalidDataException or System.Xml.XmlException)
{
    Console.Error.WriteLine(error.Message);
    return 1;
}

static void Print(SigmaComponent component, int level)
{
    Console.WriteLine($"{new string(' ', level * 2)}{component.Number} {component.Name}".TrimEnd());
    foreach (var child in component.Children)
        Print(child, level + 1);
}
