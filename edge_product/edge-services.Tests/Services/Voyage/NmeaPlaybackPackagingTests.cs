using MaritimeEdge.Models;
using MaritimeEdge.Services.Parsers;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace MaritimeEdge.Tests.Services.Voyage;

public class NmeaPlaybackPackagingTests
{
    [Fact]
    public void PlaybackRouteIsPackagedAndContainsValidGpsPositions()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "TestData", "nmea", "vietnam-coastal-route.nmea");
        Assert.True(File.Exists(path), "The GPS playback route must be included in backend output.");

        var parser = new NmeaParser(NullLogger<NmeaParser>.Instance);
        var positions = File.ReadLines(path).Take(3).Select(parser.ParseSentence).OfType<PositionData>().ToList();

        Assert.Equal(2, positions.Count);
        Assert.All(positions, position =>
        {
            Assert.InRange(position.Latitude, 8, 24);
            Assert.InRange(position.Longitude, 100, 112);
        });
        Assert.Contains(positions, position => position.SpeedOverGround > 0);
    }
}
