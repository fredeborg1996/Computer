using System.IO.Compression;
using System.Xml;
using System.Xml.Linq;

namespace Sigma.Core;

public static class SigmaProjectReader
{
    private const long MaxXmlBytes = 128L * 1024 * 1024;

    public static SigmaProject Read(string path) => ReadFile(path, "SIGPROJ", ".sit");

    public static SigmaProject ReadLibrary(string path) => ReadFile(path, "SIGLIB", ".sli");

    private static SigmaProject ReadFile(string path, string fileType, string extension)
    {
        using var file = File.OpenRead(path);
        if (file.Length > MaxXmlBytes)
            throw new InvalidDataException("Projektfilen overskrider størrelsesgrænsen.");

        Span<byte> signature = stackalloc byte[4];
        if (file.Read(signature) != signature.Length)
            throw new InvalidDataException("Projektfilen er for kort.");
        file.Position = 0;

        XElement? root;
        if (signature[0] == 'P' && signature[1] == 'K')
        {
            using var archive = new ZipArchive(file, ZipArchiveMode.Read, leaveOpen: true);
            root = ReadArchiveXml(archive, extension);
        }
        else
        {
            root = ReadXml(file);
        }

        if (root is null || root.Name.LocalName != "SigmaFile" ||
            (string?)root.Attribute("FileType") != fileType)
            throw new InvalidDataException("Filen er ikke en understøttet Sigma-fil af den valgte type.");

        var projectData = root.Element("ProjectData")
            ?? throw new InvalidDataException("Projektdata mangler.");
        var info = projectData.Element("ProjectInfo");
        var components = projectData.Element("ComponentData")?
            .Elements("Component").Select(ReadComponent).ToArray()
            ?? [];

        return new SigmaProject(
            (string?)info?.Element("ProjectName") ?? Path.GetFileNameWithoutExtension(path),
            (string?)info?.Element("ProjectNumber"),
            (string?)root.Element("BuildInfo")?.Element("SigmaVersion"),
            (string?)root.Attribute("FileSaveVersion") ?? "",
            components);
    }

    private static XElement? ReadArchiveXml(ZipArchive archive, string extension)
    {
        var candidates = archive.Entries
            .Where(entry => (entry.FullName.EndsWith(extension, StringComparison.OrdinalIgnoreCase)
                    || entry.FullName.Contains(extension + "\n", StringComparison.OrdinalIgnoreCase))
                && !entry.FullName.Contains('/') && !entry.FullName.Contains('\\'))
            .ToArray();

        if (candidates.Length != 1)
            throw new InvalidDataException($"Arkivet skal indeholde præcis én {extension} XML-fil i roden.");

        var entry = candidates[0];
        if (entry.Length > MaxXmlBytes)
            throw new InvalidDataException("Projektets XML-data overskrider størrelsesgrænsen.");

        using var stream = entry.Open();
        return ReadXml(stream);
    }

    private static XElement? ReadXml(Stream stream)
    {
        using var reader = XmlReader.Create(stream, new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            MaxCharactersInDocument = MaxXmlBytes,
        });
        return XDocument.Load(reader).Root;
    }

    private static SigmaComponent ReadComponent(XElement element) => new(
        (string?)element.Element("Name") ?? (string?)element.Attribute("Name") ?? "",
        (string?)element.Element("Number") ?? "",
        (string?)element.Element("Unit") ?? "",
        (string?)element.Element("QuantityUnregulated") ?? "",
        (string?)element.Element("UnitPrice") ?? "",
        (string?)element.Element("CostPrice") ?? "",
        (string?)element.Element("SalesPrice") ?? "",
        element.Elements("Component").Select(ReadComponent).ToArray())
    {
        UnitSalesPrice = (string?)element.Element("UnitSalesPrice") ?? "",
        Position = (string?)element.Element("Position") ?? "",
    };
}
